"""The whole client/server message contract, in one file.

`parse()` is a pure function from text to a value: it is tested without a
socket, a game, a room or an event loop, and it never raises. Text arriving off
a socket is attacker-controlled, so malformed input is an expected case and
every rejection is a `None` or an error code - never an exception that could
take a connection, or the process, down with it.

Nothing here has a side effect. The builders below return dictionaries; who
they go to is `connection.py`'s problem.

Every message type here has a counterpart in `web/types/game.ts`. There is no
schema and no codegen between the two - change one, change the other in the
same commit.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from game.command import Pause, Reset, Resize, Start
from game.command import Command as SoloVerb
from game.game import DEFAULT_HEIGHT, DEFAULT_WIDTH, PALETTE_COUNT
from game.snake import Direction, direction_from_name
from game.spawns import MULTI_HEIGHT, MULTI_WIDTH
from room.codes import CODE_LENGTH, normalise_code
from room.nickname import MAX_NICKNAME, MIN_NICKNAME
from room.room import MAX_PLAYERS, MIN_PLAYERS

#: The version of this contract. Bumped when a message changes shape, so a
#: stale browser tab can tell rather than misread.
PROTOCOL_VERSION = 1

#: No legitimate client message is anywhere near this long. A cap here is what
#: stops a socket being used to make the server allocate.
MAX_MESSAGE_BYTES = 1024


# --- client -> server -----------------------------------------------------


@dataclass(frozen=True)
class SetNickname:
    #: Raw. Cleaning happens in the handler, so the player gets told *why* a
    #: name was refused instead of the message vanishing.
    nickname: str


@dataclass(frozen=True)
class CreateRoom:
    nickname: str | None


@dataclass(frozen=True)
class JoinRoom:
    code: str
    nickname: str | None


@dataclass(frozen=True)
class LeaveRoom:
    pass


@dataclass(frozen=True)
class Ready:
    ready: bool


@dataclass(frozen=True)
class StartRoom:
    pass


@dataclass(frozen=True)
class PlayAgain:
    pass


@dataclass(frozen=True)
class Turn:
    """Steering. The only command that means something in both modes."""

    direction: Direction


@dataclass(frozen=True)
class Solo:
    """A solo command, wrapping the verb `game.command` already understands.

    Solo is the game that was here first and its rules are unchanged, so this
    reuses that module rather than restating it.
    """

    verb: SoloVerb


@dataclass(frozen=True)
class SoloExit:
    pass


@dataclass(frozen=True)
class GetLeaderboard:
    limit: int


ClientCommand = (
    SetNickname
    | CreateRoom
    | JoinRoom
    | LeaveRoom
    | Ready
    | StartRoom
    | PlayAgain
    | Turn
    | Solo
    | SoloExit
    | GetLeaderboard
)


def _text(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _is_int(value: object) -> bool:
    # `bool` is an `int` in Python, and `{"limit": true}` is not a limit.
    return isinstance(value, int) and not isinstance(value, bool)


def parse(text: str) -> ClientCommand | None:
    """Text off the socket to a command, or `None` for anything unrecognised.

    A `None` is not an error the player needs to see - it is noise, a stale
    client, or somebody poking the socket - so the caller ignores it and keeps
    the connection.
    """
    if not isinstance(text, str) or len(text.encode("utf-8", "ignore")) > MAX_MESSAGE_BYTES:
        return None
    try:
        message = json.loads(text)
    except (ValueError, TypeError):
        return None
    if not isinstance(message, dict):
        return None

    match message.get("type"):
        case "set_nickname":
            nickname = _text(message.get("nickname"))
            return SetNickname(nickname) if nickname is not None else None

        case "create_room":
            return CreateRoom(_text(message.get("nickname")))

        case "join_room":
            code = normalise_code(message.get("code"))
            # An unparseable code is still a `JoinRoom`: the player typed
            # something and deserves "that is not a room code" rather than
            # silence. The empty string can never match a real room.
            return JoinRoom(code or "", _text(message.get("nickname")))

        case "leave_room":
            return LeaveRoom()

        case "ready":
            ready = message.get("ready")
            return Ready(ready) if isinstance(ready, bool) else None

        case "start_room":
            return StartRoom()

        case "play_again":
            return PlayAgain()

        case "turn":
            direction = direction_from_name(_text(message.get("direction")) or "")
            return Turn(direction) if direction is not None else None

        case "solo_start":
            return Solo(Start())
        case "solo_pause":
            return Solo(Pause())
        case "solo_reset":
            return Solo(Reset())
        case "resize":
            # Solo only, and nothing in the browser sends it any more - the
            # board's shape is the server's and the window only decides how
            # large to draw it. It is still accepted because `Game.resize()` is
            # still a rule the solo game has, and a command that exists should
            # be reachable.
            width = message.get("width")
            height = message.get("height")
            if not _is_int(width) or not _is_int(height):
                return None
            return Solo(Resize(width, height))

        case "solo_exit":
            return SoloExit()

        case "get_leaderboard":
            limit = message.get("limit")
            return GetLeaderboard(limit if _is_int(limit) and limit > 0 else 10)

        case _:
            return None


# --- server -> client -----------------------------------------------------

#: What a refusal says out loud. The server sends a stable `code` and this
#: short, deliberately incurious sentence - never an exception, a traceback, a
#: room's contents, or anything else about what the server is doing.
ERROR_MESSAGES: dict[str, str] = {
    "already_started": "Game already started",
    "bad_code": "That is not a room code",
    "not_enough_players": "Need at least two players",
    "not_host": "Only the host can start",
    "not_in_room": "You are not in a room",
    "nickname_blocked": "Pick a different nickname",
    "nickname_invalid": "Pick a different nickname",
    "nickname_required": "Pick a nickname first",
    "nickname_taken": "Somebody in this room has that nickname",
    "nickname_too_long": f"Nickname can be at most {MAX_NICKNAME} characters",
    "nickname_too_short": f"Nickname needs at least {MIN_NICKNAME} characters",
    "rate_limited": "Slow down",
    "room_full": "Room is full",
    "room_in_progress": "That game has already started",
    "room_not_found": "Room not found",
    "room_unavailable": "Could not open a room right now",
}


def error(code: str) -> dict[str, Any]:
    return {
        "type": "error",
        "code": code,
        "message": ERROR_MESSAGES.get(code, "Something went wrong"),
    }


def loading() -> dict[str, Any]:
    """The first frame down the socket.

    The loading screen is waiting for exactly this: proof that the game server
    is up and talking, rather than a timer pretending to be one.
    """
    return {"type": "loading", "protocol": PROTOCOL_VERSION}


def menu_ready(player_id: str, nickname: str | None) -> dict[str, Any]:
    """Everything the menus need, so the browser hard-codes none of it.

    `you` is this connection's own player id. The player never sees it and
    never types it; the browser needs it for one thing only - telling which
    snake on a shared board is theirs.
    """
    return {
        "type": "menu_ready",
        "you": player_id,
        "nickname": nickname,
        "config": {
            "solo": {"width": DEFAULT_WIDTH, "height": DEFAULT_HEIGHT},
            "multi": {"width": MULTI_WIDTH, "height": MULTI_HEIGHT},
            "min_players": MIN_PLAYERS,
            "max_players": MAX_PLAYERS,
            "code_length": CODE_LENGTH,
            "nickname": {"min": MIN_NICKNAME, "max": MAX_NICKNAME},
            "palette_count": PALETTE_COUNT,
        },
    }


def nickname_set(nickname: str) -> dict[str, Any]:
    return {"type": "nickname_set", "nickname": nickname}


def room_created(lobby: dict[str, Any]) -> dict[str, Any]:
    return {"type": "room_created", "code": lobby["code"], "lobby": lobby}


def room_joined(lobby: dict[str, Any]) -> dict[str, Any]:
    return {"type": "room_joined", "code": lobby["code"], "lobby": lobby}


def player_joined(player_id: str, nickname: str | None, color: int) -> dict[str, Any]:
    return {
        "type": "player_joined",
        "player_id": player_id,
        "nickname": nickname,
        "color": color,
    }


def player_left(player_id: str, nickname: str | None) -> dict[str, Any]:
    return {"type": "player_left", "player_id": player_id, "nickname": nickname}


def countdown(code: str, seconds: int) -> dict[str, Any]:
    return {"type": "countdown", "code": code, "seconds": seconds}


def leaderboard(entries: list[dict[str, Any]], last_score: int | None = None) -> dict[str, Any]:
    """The table, and optionally the run the player just finished.

    `last_score` comes from the server's own `Game`, never from a client
    message - the browser is told what it scored, it does not report it.
    """
    return {"type": "leaderboard", "entries": entries, "last_score": last_score}
