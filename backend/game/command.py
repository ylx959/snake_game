"""The client half of the protocol.

`parse_command()` is a pure function from text to a value, so it is tested
without a `Game`, a socket, or an event loop; `apply()` is the only part with a
side effect.

Parsing never raises. Malformed text off a socket is an expected case, not an
exceptional one, so every rejection is a `None`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from .game import Game
from .snake import Direction, direction_from_name


@dataclass(frozen=True)
class Turn:
    direction: Direction


@dataclass(frozen=True)
class Start:
    pass


@dataclass(frozen=True)
class Pause:
    pass


@dataclass(frozen=True)
class Reset:
    pass


@dataclass(frozen=True)
class Resize:
    width: int
    height: int


Command = Turn | Start | Pause | Reset | Resize


def _is_dimension(value: object) -> bool:
    # `bool` is an `int` in Python, and `{"width": true}` is not a board.
    return isinstance(value, int) and not isinstance(value, bool)


def parse_command(text: str) -> Command | None:
    """Text off the socket to a command, or `None` for anything unrecognised."""
    try:
        message = json.loads(text)
    except (ValueError, TypeError):
        return None
    if not isinstance(message, dict):
        return None

    match message.get("type"):
        case "start":
            return Start()
        case "pause":
            return Pause()
        case "reset":
            return Reset()
        case "resize":
            width = message.get("width")
            height = message.get("height")
            if not _is_dimension(width) or not _is_dimension(height):
                return None
            return Resize(width, height)
        case "turn":
            name = message.get("direction")
            if not isinstance(name, str):
                return None
            direction = direction_from_name(name)
            return Turn(direction) if direction is not None else None
        case _:
            return None


def apply(command: Command, game: Game) -> None:
    """The only side effect in this module."""
    match command:
        case Turn(direction):
            game.turn(direction)
        case Start():
            game.start()
        case Pause():
            # One key, one command: the browser sends `pause` for Space and the
            # server decides whether that means pause or resume.
            game.toggle_pause()
        case Reset():
            game.reset()
        case Resize(width, height):
            game.resize(width, height)
