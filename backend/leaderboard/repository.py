"""Storing and reading solo scores.

`LeaderboardRepository` is the seam. Everything above it - the session handler,
the protocol - depends on the four methods in the Protocol below and on nothing
about SQL, so moving from the development SQLite file to a deployed Postgres is
a new class here and an environment variable, not a change anywhere else.

Two rules the storage layer is responsible for, because it is the only thing
that sees every row:

- **Ordering.** Score descending, then `achieved_at` ascending: on a tie the
  player who got there first is ahead, which is the only tie-break that cannot
  be gamed by playing later.
- **Trust.** A score arrives from `Game.score` at the end of a server-run game,
  never from a client message. This module still validates what it is handed,
  because a store that assumes its caller is careful stops being a boundary.
"""

from __future__ import annotations

import os
import sqlite3
import time
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from room.nickname import MAX_NICKNAME, clean_nickname

#: The full table the API will return. The main screen shows the top ten of it.
TOP_LIMIT = 100

#: How much of the table is on screen, and so how much of it is spoken for:
#: a name in the top ten cannot be played under by anybody else. The rule is
#: tied to what a player can actually see, because the point of it is that
#: nobody can appear to be one of the names on the board.
TOP_VISIBLE = 10

#: Nothing sane reaches this; it is a guard against a stored value that could
#: only have come from a bug.
MAX_SCORE = 1_000_000

#: The lowest score worth keeping. A run that ate nothing is a run that did not
#: happen - it says nothing about the player, it is the commonest way to leave
#: the board, and a table of them buries the scores that mean something. The
#: run still finishes, is still shown to the player, and still costs them their
#: name; it simply is not written down.
MIN_RECORDED_SCORE = 1

DEFAULT_DATABASE_URL = "sqlite:///./leaderboard.db"


@dataclass(frozen=True)
class LeaderboardEntry:
    rank: int
    nickname: str
    score: int
    #: Unix seconds, UTC. The browser formats it; the server does not guess at
    #: the player's locale or timezone.
    achieved_at: float

    def to_dict(self) -> dict[str, Any]:
        """Keep in sync with `LeaderboardEntry` in web/types/game.ts."""
        return {
            "rank": self.rank,
            "nickname": self.nickname,
            "score": self.score,
            "achieved_at": self.achieved_at,
        }


class LeaderboardRepository(Protocol):
    """What the rest of the server is allowed to know about storage."""

    def record(self, nickname: str, score: int, achieved_at: float | None = None) -> bool: ...

    def top(self, limit: int = TOP_LIMIT) -> list[LeaderboardEntry]: ...

    def reserved_nicknames(self, limit: int = TOP_VISIBLE) -> set[str]: ...

    def clear(self) -> None: ...

    def close(self) -> None: ...


def _rank(rows: Iterable[tuple[str, int, float]]) -> list[LeaderboardEntry]:
    """Number an already-sorted run of rows.

    Ranking is done here rather than in SQL so that every backend produces the
    same numbers from the same rows - window functions differ, and this is four
    lines.
    """
    return [
        LeaderboardEntry(rank=index, nickname=nickname, score=score, achieved_at=achieved_at)
        for index, (nickname, score, achieved_at) in enumerate(rows, start=1)
    ]


class SqliteLeaderboardRepository:
    """The development store: one file, no server, no setup.

    `check_same_thread=False` because the FastAPI app hands these calls to a
    worker thread (`asyncio.to_thread`) so a slow disk cannot stall the game
    clock; the connection is guarded by SQLite's own locking and every call
    here is a single statement.
    """

    def __init__(self, path: str | Path = "leaderboard.db") -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self.path, check_same_thread=False)
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._create_schema()

    def _create_schema(self) -> None:
        with self._connection:
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS solo_scores (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    nickname     TEXT    NOT NULL,
                    nickname_key TEXT    NOT NULL,
                    score        INTEGER NOT NULL,
                    achieved_at  REAL    NOT NULL
                )
                """
            )
            self._migrate_to_one_row_per_player()
            # One row per player is the table's shape, not a habit of the code
            # that writes it: the database refuses a second row for a name.
            self._connection.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS solo_scores_player
                ON solo_scores (nickname_key)
                """
            )
            # The one query this table serves, in the order it serves it.
            self._connection.execute(
                """
                CREATE INDEX IF NOT EXISTS solo_scores_ranking
                ON solo_scores (score DESC, achieved_at ASC)
                """
            )

    def _migrate_to_one_row_per_player(self) -> None:
        """Bring a table written before the one-row rule up to it.

        The table used to be a list of *runs*, so a player who kept restarting
        filled the board with themselves - their own worse attempts sitting
        below their best, pushing everyone else down. Now it is a list of
        players, and this is what an existing file has to go through before the
        unique index above will build on it.

        Both steps are no-ops on a table that is already in shape, so this runs
        on every open and costs a `PRAGMA` and one scan of a hundred-odd rows.
        """
        columns = {
            row[1] for row in self._connection.execute("PRAGMA table_info(solo_scores)")
        }
        if "nickname_key" not in columns:
            self._connection.execute(
                "ALTER TABLE solo_scores ADD COLUMN nickname_key TEXT NOT NULL DEFAULT ''"
            )

        # Backfilled in Python, not SQL: the key is `str.casefold()`, which is
        # what every other name comparison in the server uses, and SQLite's
        # `lower()` only folds ASCII. A nickname may be any printable character.
        missing = self._connection.execute(
            "SELECT id, nickname FROM solo_scores WHERE nickname_key = ''"
        ).fetchall()
        self._connection.executemany(
            "UPDATE solo_scores SET nickname_key = ? WHERE id = ?",
            [(nickname.casefold(), row_id) for row_id, nickname in missing],
        )

        # Collapse the duplicates the old shape allowed, keeping each player's
        # best - highest score, and on a tie the one they got there with first.
        # Done here rather than in SQL because "best" is the same two-key
        # comparison `top()` sorts by, and stating it once in Python is clearer
        # than a correlated subquery that has to be read twice to be believed.
        rows = self._connection.execute(
            "SELECT id, nickname_key, score, achieved_at FROM solo_scores"
        ).fetchall()

        best: dict[str, tuple[int, int, float]] = {}
        for row_id, key, score, achieved_at in rows:
            current = best.get(key)
            if current is None or (score, -achieved_at) > (current[1], -current[2]):
                best[key] = (row_id, score, achieved_at)

        keep = {row_id for row_id, _, _ in best.values()}
        self._connection.executemany(
            "DELETE FROM solo_scores WHERE id = ?",
            [(row[0],) for row in rows if row[0] not in keep],
        )

    def record(self, nickname: str, score: int, achieved_at: float | None = None) -> bool:
        """Write one finished run. False when the table did not change.

        **One row per player, holding their best.** A player who finishes a
        better run moves their own row up the table; a player who finishes a
        worse one leaves it exactly where it was, rather than appearing twice.
        The board is a list of players, not a list of runs - a player restarting
        used to fill it with their own worse attempts and push everyone else
        down, which said nothing about anybody.

        Keyed on the case-folded name, because that is what the rest of the
        server means by "the same name": a top-ten nickname is reserved
        case-insensitively, so nobody else can be playing under it anyway.

        Validated rather than trusted, even though the only caller is the
        server's own game-over path: a store that assumes its caller is careful
        is not a boundary. A scoreless run is refused here too - see
        `MIN_RECORDED_SCORE`.
        """
        cleaned = clean_nickname(nickname)
        if cleaned.nickname is None:
            return False
        if not isinstance(score, int) or isinstance(score, bool):
            return False
        if not MIN_RECORDED_SCORE <= score <= MAX_SCORE:
            return False

        display = cleaned.nickname[:MAX_NICKNAME]
        key = display.casefold()

        with self._connection:
            standing = self._connection.execute(
                "SELECT score FROM solo_scores WHERE nickname_key = ?", (key,)
            ).fetchone()

            # Equal is not better: leaving the earlier row alone keeps the
            # timestamp they first reached this score with, and `top()` breaks a
            # tie by who got there first.
            if standing is not None and score <= standing[0]:
                return False

            self._connection.execute(
                """
                INSERT INTO solo_scores (nickname, nickname_key, score, achieved_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (nickname_key) DO UPDATE SET
                    nickname    = excluded.nickname,
                    score       = excluded.score,
                    achieved_at = excluded.achieved_at
                """,
                (display, key, score, achieved_at or time.time()),
            )
        return True

    def top(self, limit: int = TOP_LIMIT) -> list[LeaderboardEntry]:
        """The best runs, best first, ties broken by who got there first."""
        limit = max(0, min(int(limit), TOP_LIMIT))
        rows = self._connection.execute(
            """
            SELECT nickname, score, achieved_at
            FROM solo_scores
            ORDER BY score DESC, achieved_at ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return _rank(rows)

    def reserved_nicknames(self, limit: int = TOP_VISIBLE) -> set[str]:
        """The names nobody else may play under, case-folded for comparison.

        Case-folded rather than lower-cased: `str.lower()` is a display
        transform, `str.casefold()` is the one meant for "are these the same
        word", and the difference is the whole point of a check that exists to
        stop one player looking like another.
        """
        return {entry.nickname.casefold() for entry in self.top(limit)}

    def clear(self) -> None:
        with self._connection:
            self._connection.execute("DELETE FROM solo_scores")

    def close(self) -> None:
        self._connection.close()


def repository_from_env(url: str | None = None) -> LeaderboardRepository:
    """Build the store the environment asks for.

    `DATABASE_URL` is the whole configuration surface, so deployment is one
    variable rather than a code change:

        sqlite:///./leaderboard.db      a file, the default
        sqlite:///:memory:             nothing survives the process
        postgresql://user@host/db      not built yet - see below

    Postgres is deliberately a clear failure rather than a silent fall back to
    a local file: a deployed server quietly writing its scoreboard to a
    container's disk looks exactly like a working one until it restarts.
    """
    url = url or os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL

    if url.startswith("sqlite://"):
        path = url[len("sqlite://") :]
        # sqlite:///relative -> ./relative ; sqlite:///:memory: -> :memory:
        path = path.lstrip("/") if not path.startswith("//") else path[1:]
        return SqliteLeaderboardRepository(path or ":memory:")

    if url.startswith(("postgres://", "postgresql://")):
        raise NotImplementedError(
            "the Postgres leaderboard store is not built yet; implement "
            "LeaderboardRepository over psycopg and dispatch it here"
        )

    raise ValueError("unsupported DATABASE_URL scheme")
