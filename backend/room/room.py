"""A room: the players in it, who is in charge, and what the round is doing.

    WAITING -> COUNTDOWN -> RUNNING -> RESULTS -> WAITING -> ... -> EMPTY

Every transition is a synchronous method, so the whole lifecycle can be driven
from a test without a socket or an event loop. The only asynchronous thing about
a room is the clock in `room.clock`, which calls `tick()` on a timer - and there
is exactly one of those per room, never one per player.
"""

from __future__ import annotations

import time
from enum import Enum
from typing import Any

from game.multiplayer import MultiplayerGame, MultiStatus
from game.snake import Direction
from game.spawns import MULTI_HEIGHT, MULTI_WIDTH

from .session import PlayerSession

MAX_PLAYERS = 5
MIN_PLAYERS = 2
COUNTDOWN_SECONDS = 3

#: A lobby nobody has touched for this long is abandoned. Rooms live in memory
#: and cost a dictionary entry, but a code is a scarce, human-readable thing -
#: expiring the dead ones is what keeps them short.
IDLE_TTL_SECONDS = 15 * 60


class RoomStatus(str, Enum):
    WAITING = "waiting"
    COUNTDOWN = "countdown"
    RUNNING = "running"
    RESULTS = "results"
    EMPTY = "empty"


class RoomError(Exception):
    """A refusal the player is allowed to see.

    It carries a stable `code` and nothing else: the message the browser shows
    is the browser's, so a refusal can never leak what the server is doing
    internally.
    """

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class GameRoom:
    def __init__(self, code: str) -> None:
        self.code = code
        #: Insertion ordered, and the order *is* join order - which decides the
        #: host, the spawn slots and the food tie-break.
        self.players: dict[str, PlayerSession] = {}
        self.host_id: str | None = None
        self.status = RoomStatus.WAITING
        self.game: MultiplayerGame | None = None
        self.countdown_seconds = COUNTDOWN_SECONDS
        self.touched_at = time.monotonic()
        #: The round's clock task, owned by whoever started it. `None` between
        #: rounds. Cancelling it is idempotent - see `room.clock`.
        self.task: Any = None

    # --- who is here ------------------------------------------------------

    @property
    def order(self) -> list[PlayerSession]:
        return list(self.players.values())

    @property
    def is_empty(self) -> bool:
        return not self.players

    def touch(self) -> None:
        self.touched_at = time.monotonic()

    def add(self, session: PlayerSession) -> None:
        """Let a player in, or say why not.

        The three refusals are the three things a player can see from outside:
        the room is full, the room is mid-round, or somebody in it already has
        that name. None of them reveals anything else about the room.
        """
        if self.status in (RoomStatus.COUNTDOWN, RoomStatus.RUNNING):
            raise RoomError("room_in_progress")
        if self.status is RoomStatus.EMPTY:
            raise RoomError("room_not_found")
        if len(self.players) >= MAX_PLAYERS:
            raise RoomError("room_full")
        if self._nickname_taken(session.nickname):
            raise RoomError("nickname_taken")

        session.color = self._free_colour()
        session.room_code = self.code
        session.ready = False
        self.players[session.player_id] = session
        if self.host_id is None:
            self.host_id = session.player_id
        self.touch()

    def remove(self, player_id: str) -> None:
        """Take a player out. Safe to call twice.

        A socket can report its own death more than once - a close frame, then
        the receive loop unwinding, then the cleanup in `finally` - so every
        step here has to tolerate having already happened.
        """
        session = self.players.pop(player_id, None)
        if session is None:
            return

        session.room_code = None
        session.ready = False

        # Mid-round, leaving is dying. The round carries on for everyone else,
        # and the body comes off the board like any other death.
        if self.game is not None and player_id in self.game.players:
            player = self.game.players[player_id]
            if player.alive:
                player.alive = False
                player.died_at_tick = self.game.ticks

        if self.host_id == player_id:
            # The earliest joiner still here. `players` is insertion ordered,
            # so "earliest" is just the first key.
            self.host_id = next(iter(self.players), None)

        if not self.players:
            self.status = RoomStatus.EMPTY
            self.game = None
        self.touch()

    def set_ready(self, player_id: str, ready: bool) -> None:
        session = self.players.get(player_id)
        if session is not None:
            session.ready = bool(ready)
            self.touch()

    def _nickname_taken(self, nickname: str | None) -> bool:
        if nickname is None:
            return False
        folded = nickname.casefold()
        return any(
            player.nickname is not None and player.nickname.casefold() == folded
            for player in self.players.values()
        )

    def _free_colour(self) -> int:
        """The lowest colour nobody in the room is wearing.

        Lowest rather than next, so a player who leaves frees their colour for
        the next arrival instead of pushing the room past the end of the list.
        """
        taken = {player.color for player in self.players.values()}
        return next(index for index in range(MAX_PLAYERS) if index not in taken)

    # --- the round --------------------------------------------------------

    def request_start(self, player_id: str) -> None:
        """The host's start button. Refuses with a code the player can see."""
        if self.status in (RoomStatus.COUNTDOWN, RoomStatus.RUNNING):
            raise RoomError("already_started")
        if player_id != self.host_id:
            raise RoomError("not_host")
        if len(self.players) < MIN_PLAYERS:
            raise RoomError("not_enough_players")
        self.start_round()

    def start_round(self, seed: int | None = None) -> None:
        """Build the shared game and put the room into its countdown."""
        self.game = MultiplayerGame(
            [(player.player_id, player.nickname or "PLAYER") for player in self.order],
            width=MULTI_WIDTH,
            height=MULTI_HEIGHT,
            seed=seed,
        )
        self.status = RoomStatus.COUNTDOWN
        self.touch()

    def begin_play(self) -> None:
        """End the countdown. Everyone starts on the same tick because there is
        only one game to start."""
        if self.status is RoomStatus.COUNTDOWN and self.game is not None:
            self.game.begin()
            self.status = RoomStatus.RUNNING
            self.touch()

    def turn(self, player_id: str, direction: Direction) -> bool:
        if self.game is None or player_id not in self.players:
            return False
        return self.game.turn(player_id, direction)

    def tick(self) -> None:
        """One step of the shared clock, for every snake at once."""
        if self.status is not RoomStatus.RUNNING or self.game is None:
            return
        self.game.tick()
        if self.game.status is MultiStatus.FINISHED:
            self.status = RoomStatus.RESULTS
        self.touch()

    def return_to_lobby(self) -> None:
        """Back to the same room, same code, no game."""
        if self.is_empty:
            return
        self.game = None
        self.status = RoomStatus.WAITING
        for player in self.players.values():
            player.ready = False
        self.touch()

    def is_expired(self, now: float, ttl: float = IDLE_TTL_SECONDS) -> bool:
        """Only a room that is not playing can go stale."""
        if self.status in (RoomStatus.COUNTDOWN, RoomStatus.RUNNING):
            return False
        return now - self.touched_at >= ttl

    # --- talking to the room ---------------------------------------------

    def broadcast(self, payload: dict[str, Any]) -> None:
        """The same message to everyone, including whoever is spectating.

        Iterating a copy: a send can mark a session disconnected, and removing
        a player mid-broadcast would otherwise resize the dictionary underneath
        the loop.
        """
        for player in list(self.players.values()):
            player.send(payload)

    # --- what the browser sees -------------------------------------------

    def lobby_state(self) -> dict[str, Any]:
        """Keep in sync with `LobbyState` in web/types/game.ts."""
        return {
            "type": "lobby_state",
            "code": self.code,
            "status": self.status.value,
            "host_id": self.host_id,
            "count": len(self.players),
            "capacity": MAX_PLAYERS,
            "min_players": MIN_PLAYERS,
            "players": [
                {
                    "player_id": player.player_id,
                    "nickname": player.nickname,
                    "color": player.color,
                    "ready": player.ready,
                    "host": player.player_id == self.host_id,
                }
                for player in self.order
            ],
        }

    def results(self) -> dict[str, Any]:
        """Keep in sync with `ResultsMessage` in web/types/game.ts."""
        return {
            "type": "results",
            "code": self.code,
            "rankings": self.game.rankings() if self.game is not None else [],
        }

    def game_state(self) -> dict[str, Any] | None:
        if self.game is None:
            return None
        payload = self.game.to_dict()
        payload["code"] = self.code
        return payload
