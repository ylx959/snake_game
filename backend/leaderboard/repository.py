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

#: Nothing sane reaches this; it is a guard against a stored value that could
#: only have come from a bug.
MAX_SCORE = 1_000_000

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
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    nickname    TEXT    NOT NULL,
                    score       INTEGER NOT NULL,
                    achieved_at REAL    NOT NULL
                )
                """
            )
            # The one query this table serves, in the order it serves it.
            self._connection.execute(
                """
                CREATE INDEX IF NOT EXISTS solo_scores_ranking
                ON solo_scores (score DESC, achieved_at ASC)
                """
            )

    def record(self, nickname: str, score: int, achieved_at: float | None = None) -> bool:
        """Write one finished run. False when the row was not fit to store.

        Validated rather than trusted, even though the only caller is the
        server's own game-over path: a store that assumes its caller is careful
        is not a boundary.
        """
        cleaned = clean_nickname(nickname)
        if cleaned.nickname is None:
            return False
        if not isinstance(score, int) or isinstance(score, bool):
            return False
        if not 0 <= score <= MAX_SCORE:
            return False

        with self._connection:
            self._connection.execute(
                "INSERT INTO solo_scores (nickname, score, achieved_at) VALUES (?, ?, ?)",
                (cleaned.nickname[:MAX_NICKNAME], score, achieved_at or time.time()),
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
