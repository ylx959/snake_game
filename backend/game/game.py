"""The game itself: owns the board, drives the tick, and is the only thing that
decides what is true. The browser renders whatever this produces.
"""

from __future__ import annotations

import random
from enum import Enum
from typing import Any

from .collision import is_fatal
from .snake import Cell, Direction, Snake

DEFAULT_WIDTH = 24
DEFAULT_HEIGHT = 24

#: Bounds on a board the browser asks for. The lower one keeps `reset()` able to
#: lay a three-cell snake out on the row; the upper one stops a hostile client
#: asking for a board big enough to matter.
MIN_DIMENSION = 8
MAX_DIMENSION = 240
DEFAULT_TICK_SECONDS = 0.12

#: How many background/foreground pairs the browser cycles through. The server
#: sends only an *index*; the hex values live in web/lib/palette.ts, so a colour
#: can be retuned without touching or restarting the backend.
PALETTE_COUNT = 6


class GameStatus(str, Enum):
    READY = "ready"
    RUNNING = "running"
    PAUSED = "paused"
    GAME_OVER = "game_over"


class Game:
    """A single game session. One per connected player.

    `tick()` is the whole game in one call: resolve death, resolve food, move.
    Everything else is setup or serialization.
    """

    def __init__(
        self,
        width: int = DEFAULT_WIDTH,
        height: int = DEFAULT_HEIGHT,
        tick_seconds: float = DEFAULT_TICK_SECONDS,
        seed: int | None = None,
    ) -> None:
        self.width = width
        self.height = height
        self.tick_seconds = tick_seconds
        self._rng = random.Random(seed)
        self.reset()

    # --- setup -----------------------------------------------------------

    def reset(self) -> None:
        self.snake = Snake((self.width // 2, self.height // 2), Direction.RIGHT)
        self.food: Cell | None = None
        self._respawn_food()
        self.score = 0
        self.ticks = 0
        self.palette = 0
        self.status = GameStatus.READY

    def resize(self, width: int, height: int) -> None:
        """Reshape the board to what the browser can show, and start over.

        The board fills the viewport, so its shape is the one piece of game
        state only the browser knows. Resizing restarts the game rather than
        trying to rescue a snake that may now be outside the board - a window
        drag mid-run is rare, and a silently teleported snake is worse than an
        obvious fresh start.
        """
        width = min(max(width, MIN_DIMENSION), MAX_DIMENSION)
        height = min(max(height, MIN_DIMENSION), MAX_DIMENSION)
        if width == self.width and height == self.height:
            return
        self.width = width
        self.height = height
        self.reset()

    # --- commands from the player ----------------------------------------

    def start(self) -> None:
        if self.status in (GameStatus.READY, GameStatus.PAUSED):
            self.status = GameStatus.RUNNING

    def pause(self) -> None:
        if self.status is GameStatus.RUNNING:
            self.status = GameStatus.PAUSED

    def toggle_pause(self) -> None:
        """Space is a single key, so pausing and resuming are the same command."""
        if self.status is GameStatus.PAUSED:
            self.status = GameStatus.RUNNING
        else:
            self.pause()

    def turn(self, direction: Direction) -> None:
        """A turn also starts the game, so the first arrow key just works."""
        if self.status is GameStatus.READY:
            self.status = GameStatus.RUNNING
        if self.status is GameStatus.RUNNING:
            self.snake.turn(direction)

    # --- the loop ---------------------------------------------------------

    def tick(self) -> None:
        if self.status is not GameStatus.RUNNING:
            return

        target = self.snake.next_head()
        if is_fatal(target, self.snake.cells, self.width, self.height):
            self.status = GameStatus.GAME_OVER
            return

        # Resolve food *before* moving, so growth and score land on the same
        # tick. Growing first also keeps the tail in place, which is what makes
        # the new segment appear immediately rather than one tick late.
        eating = self.food is not None and self.food == target
        if eating:
            self.snake.grow()

        self.snake.move()
        self.ticks += 1

        if eating:
            self.score += 1
            # Every apple flips the whole world to the next pair, in order.
            self.palette = (self.palette + 1) % PALETTE_COUNT
            if not self._respawn_food():
                self.status = GameStatus.GAME_OVER  # board full: the snake won

    # --- what the browser sees --------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """The wire format. Keep in sync with web/types/game.ts."""
        return {
            "type": "state",
            "width": self.width,
            "height": self.height,
            "status": self.status.value,
            "score": self.score,
            "ticks": self.ticks,
            "direction": self.snake.direction.name,
            "snake": [[x, y] for x, y in self.snake.cells],
            "food": list(self.food) if self.food is not None else None,
            "palette": self.palette,
        }

    # --- internals ---------------------------------------------------------

    def _respawn_food(self) -> bool:
        """Place food on a free cell. False when the board is full.

        Samples from the *free* cells rather than retrying random guesses, so a
        nearly-full board still terminates.
        """
        free = [
            (x, y)
            for y in range(self.height)
            for x in range(self.width)
            if not self.snake.occupies((x, y))
        ]
        if not free:
            self.food = None
            return False
        self.food = self._rng.choice(free)
        return True
