"""Where each snake starts on a shared board.

A layout per player count rather than one list sliced down to size: with a
single list the first two players would sit wherever the first two entries
happen to be, and "spread out" is a property of the *whole set*, not of any one
point. Two players face each other across the board; three and five sit on a
regular polygon; four take the four corners of one rectangle. Every head points
at the middle, so nobody starts by steering away from a wall they cannot see.

Pure data and pure functions - no `Snake`, no `Game`, no board state.
"""

from __future__ import annotations

from .snake import Cell, Direction

#: A shared board is bigger than the solo one - five snakes need the room - but
#: it is still exactly 16:9, so the browser letterboxes it the same way.
MULTI_WIDTH = 64
MULTI_HEIGHT = 36

#: One spawn: where the head goes, and which way it faces.
Spawn = tuple[Cell, Direction]

_UP, _DOWN, _LEFT, _RIGHT = Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT

#: Keyed by player count. Coordinates are for a 64x36 board and are scaled in
#: `spawns_for()` if the board is ever a different size.
_LAYOUTS: dict[int, tuple[Spawn, ...]] = {
    1: (((12, 18), _RIGHT),),
    # Head on, across the long axis: the fairest two-player start there is.
    2: (((12, 18), _RIGHT), ((51, 18), _LEFT)),
    # An equilateral triangle about the centre.
    3: (((32, 6), _DOWN), ((15, 24), _RIGHT), ((49, 24), _LEFT)),
    # The four corners of a rectangle, mirrored in both axes. All four run
    # inwards along the long axis, which is the one with room to spare.
    4: (((12, 9), _RIGHT), ((51, 9), _LEFT), ((12, 26), _RIGHT), ((51, 26), _LEFT)),
    # A pentagon. The odd count has no mirror symmetry to offer, so it gets
    # rotational symmetry instead: five points, equal angles apart.
    5: (
        ((32, 6), _DOWN),
        ((11, 14), _RIGHT),
        ((19, 28), _UP),
        ((45, 28), _UP),
        ((53, 14), _LEFT),
    ),
}

MAX_PLAYERS = max(_LAYOUTS)


def spawns_for(count: int, width: int = MULTI_WIDTH, height: int = MULTI_HEIGHT) -> list[Spawn]:
    """The spawn for each of `count` players, in slot order.

    Raises `ValueError` for a count with no layout, rather than improvising one:
    an unplanned start is exactly the thing that turns out to be unfair.
    """
    layout = _LAYOUTS.get(count)
    if layout is None:
        raise ValueError(f"no spawn layout for {count} players")
    if (width, height) == (MULTI_WIDTH, MULTI_HEIGHT):
        return list(layout)

    # A differently shaped board is a test fixture, not a real game. Scale the
    # points into it and let the caller's own bounds checks catch anything silly.
    scale_x = width / MULTI_WIDTH
    scale_y = height / MULTI_HEIGHT
    return [
        ((int(x * scale_x), int(y * scale_y)), direction) for (x, y), direction in layout
    ]
