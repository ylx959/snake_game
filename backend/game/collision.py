"""Death conditions.

Pure predicates over a candidate cell and a body, so they are testable without
a `Snake` or a `Game`, and so `Game` can ask "would this kill me?" *before*
moving anything.
"""

from __future__ import annotations

from collections.abc import Sequence

from .snake import Cell


def hits_wall(cell: Cell, width: int, height: int) -> bool:
    """True when `cell` is off the board. The board does not wrap."""
    x, y = cell
    return x < 0 or y < 0 or x >= width or y >= height


def hits_self(cell: Cell, body: Sequence[Cell]) -> bool:
    """True when `cell` is inside `body`, ignoring its last element.

    The tail vacates on the same tick the head arrives, so moving onto it is
    legal - which is what makes following your own tail work.
    """
    return cell in list(body)[:-1]


def is_fatal(cell: Cell, body: Sequence[Cell], width: int, height: int) -> bool:
    return hits_wall(cell, width, height) or hits_self(cell, body)
