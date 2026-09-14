"""Snake body state: where it is, which way it's going, how it grows.

The body is ordered head-first. A turn requested mid-tick is buffered in
`_pending` and only applied on `move()`, so two key presses inside one tick can
never fold the snake back onto its own neck.
"""

from __future__ import annotations

from collections import deque
from enum import Enum

#: A grid coordinate. `y` grows downwards, matching the canvas.
Cell = tuple[int, int]

DEFAULT_LENGTH = 3


class Direction(Enum):
    """The (dx, dy) step for a heading. The value *is* the step."""

    UP = (0, -1)
    DOWN = (0, 1)
    LEFT = (-1, 0)
    RIGHT = (1, 0)

    @property
    def opposite(self) -> "Direction":
        dx, dy = self.value
        return Direction((-dx, -dy))

def direction_from_name(name: str) -> Direction | None:
    """Wire name, e.g. "UP". `None` for anything unrecognised, so a malformed
    client message is ignored rather than fatal."""
    try:
        return Direction[name]
    except KeyError:
        return None


class Snake:
    def __init__(
        self,
        start: Cell,
        direction: Direction = Direction.RIGHT,
        length: int = DEFAULT_LENGTH,
    ) -> None:
        x, y = start
        # Lay the body out *behind* the head, against the heading, so a snake
        # spawned facing any direction begins with its body trailing it rather
        # than in front of it - which would be an instant self-collision.
        dx, dy = direction.value
        self._body: deque[Cell] = deque((x - dx * i, y - dy * i) for i in range(length))
        self._direction = direction
        self._pending = direction
        self._grow = 0

    @property
    def head(self) -> Cell:
        return self._body[0]

    @property
    def cells(self) -> list[Cell]:
        return list(self._body)

    @property
    def direction(self) -> Direction:
        """The *committed* heading. A buffered turn is not visible here."""
        return self._direction

    def __len__(self) -> int:
        return len(self._body)

    def occupies(self, cell: Cell) -> bool:
        return cell in self._body

    def turn(self, direction: Direction) -> None:
        """Queue a direction change. A 180-degree reversal is ignored.

        The comparison is against the committed heading, never the buffered
        one: from RIGHT, pressing UP then LEFT inside a single tick would
        otherwise look like two legal turns and together drive the head into
        its own neck.
        """
        if direction is self._direction.opposite:
            return
        self._pending = direction

    def grow(self, amount: int = 1) -> None:
        """Owe the snake `amount` extra segments, paid off by later moves."""
        self._grow += amount

    def next_head(self) -> Cell:
        """Where the head lands next tick, without moving anything."""
        dx, dy = self._pending.value
        x, y = self.head
        return (x + dx, y + dy)

    def move(self) -> None:
        """Advance one tick: commit the pending turn, push a new head, drop the
        tail unless there is growth owed."""
        self._direction = self._pending
        self._body.appendleft(self.next_head())
        if self._grow > 0:
            self._grow -= 1
        else:
            self._body.pop()
