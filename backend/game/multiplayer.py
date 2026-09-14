"""Several snakes on one board, resolved in lockstep.

The solo `Game` can move its snake the moment it knows the move is survivable,
because there is nobody else to consider. With five snakes that shortcut is a
fairness bug: whether you die can depend on whether the player next to you has
already moved, and therefore on whose message reached the server first.

So `tick()` here is strictly staged, and the stages are the whole design:

    1. every alive snake's `next_head()`, computed from one snapshot
    2. every death, decided against that same snapshot - nothing has moved yet
    3. food, awarded in slot order to whoever is still alive
    4. the survivors move
    5. eaten apples come back

Nothing in this module knows about sockets, rooms or asyncio.
"""

from __future__ import annotations

import math
import random
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import Enum
from itertools import combinations
from typing import Any

from .collision import hits_self, hits_wall
from .snake import Cell, Direction, Snake
from .spawns import MULTI_HEIGHT, MULTI_WIDTH, spawns_for

DEFAULT_TICK_SECONDS = 0.10

#: How many apples are on the board, by player count. More snakes means more
#: competition for the same cell, so the board gets more to go round - but not
#: one each past four, or a five-player board stops being a contest.
FOOD_FOR_PLAYERS: dict[int, int] = {1: 1, 2: 2, 3: 3, 4: 4, 5: 4}

#: Shared with the solo game: the browser cycles the same eight pairs.
PALETTE_COUNT = 8


class MultiStatus(str, Enum):
    COUNTDOWN = "countdown"
    RUNNING = "running"
    FINISHED = "finished"


@dataclass
class MultiplayerPlayer:
    """One snake and everything the scoreboard says about it."""

    player_id: str
    nickname: str
    #: Slot in the spawn layout, and the index of this player's snake colour.
    #: The server decides both; the hex lives in web/lib/palette.ts.
    slot: int
    snake: Snake
    alive: bool = True
    score: int = 0
    #: The tick this player died on. `None` while alive. Ranking reads it, so
    #: "who lasted longer" is a recorded fact rather than a reconstruction.
    died_at_tick: int | None = None

    @property
    def color(self) -> int:
        return self.slot

    @property
    def direction(self) -> Direction:
        return self.snake.direction

    @property
    def cells(self) -> list[Cell]:
        """A dead snake is off the board, so it has no cells to draw or hit."""
        return self.snake.cells if self.alive else []


class MultiplayerGame:
    """One board, one clock, up to five snakes.

    Construct it with the players in join order; slots, colours and spawns all
    follow from that order, so two rooms with the same players always lay out
    the same way.
    """

    def __init__(
        self,
        players: Sequence[tuple[str, str]],
        width: int = MULTI_WIDTH,
        height: int = MULTI_HEIGHT,
        tick_seconds: float = DEFAULT_TICK_SECONDS,
        seed: int | None = None,
    ) -> None:
        if not players:
            raise ValueError("a game needs at least one player")

        self.width = width
        self.height = height
        self.tick_seconds = tick_seconds
        self._rng = random.Random(seed)

        spawns = spawns_for(len(players), width, height)
        self.order: list[MultiplayerPlayer] = [
            MultiplayerPlayer(
                player_id=player_id,
                nickname=nickname,
                slot=slot,
                snake=Snake(head, direction),
            )
            for slot, ((player_id, nickname), (head, direction)) in enumerate(
                zip(players, spawns, strict=True)
            )
        ]
        self.players: dict[str, MultiplayerPlayer] = {p.player_id: p for p in self.order}

        self.status = MultiStatus.COUNTDOWN
        self.ticks = 0
        self.palette = 0
        self.foods: list[Cell] = []
        self._turned: set[str] = set()
        self._fill_food(FOOD_FOR_PLAYERS.get(len(players), 4))

    # --- lifecycle --------------------------------------------------------

    def begin(self) -> None:
        """End the countdown. The only way into RUNNING."""
        if self.status is MultiStatus.COUNTDOWN:
            self.status = MultiStatus.RUNNING
            self._turned.clear()

    @property
    def alive_count(self) -> int:
        return sum(1 for p in self.order if p.alive)

    @property
    def _survivors_needed(self) -> int:
        """How many may remain before the round is over.

        A real room is two or more, and stops at one. A single-player game -
        only ever a test fixture - would end before it started under that rule,
        so it runs until its one snake is gone.
        """
        return 1 if len(self.order) > 1 else 0

    # --- commands from a player -------------------------------------------

    def turn(self, player_id: str, direction: Direction) -> bool:
        """Buffer a heading for the next tick. True when it was taken.

        At most one turn per player per tick is accepted while the game runs:
        the snake's own buffer already refuses a straight reversal, but letting
        a player overwrite it repeatedly inside one tick lets a fast client
        steer on the very last millisecond before the tick lands. A refused
        turn - a reversal - does not use up the allowance, so a mistyped key
        does not cost the player their move.

        During the countdown the allowance does not apply. Nothing is moving,
        so pressing a direction early only decides which way you set off, and
        changing your mind before the clock starts is free.
        """
        player = self.players.get(player_id)
        if player is None or not player.alive:
            return False
        if self.status is MultiStatus.FINISHED:
            return False

        running = self.status is MultiStatus.RUNNING
        if running and player_id in self._turned:
            return False
        if direction is player.snake.direction.opposite:
            return False

        player.snake.turn(direction)
        if running:
            self._turned.add(player_id)
        return True

    # --- the loop ---------------------------------------------------------

    def tick(self) -> None:
        if self.status is not MultiStatus.RUNNING:
            return

        alive = [p for p in self.order if p.alive]
        # One snapshot, read by every stage below. Nothing moves until stage 4,
        # so no player's fate can depend on another player's move.
        targets = {p.player_id: p.snake.next_head() for p in alive}

        doomed = self._deaths(alive, targets)
        survivors = [p for p in alive if p.player_id not in doomed]

        eaten = self._award_food(survivors, targets)

        for player in survivors:
            if player.player_id in eaten:
                player.snake.grow()
            player.snake.move()

        for player in alive:
            if player.player_id in doomed:
                player.alive = False
                player.died_at_tick = self.ticks

        self.ticks += 1

        for player_id, cell in eaten.items():
            self.players[player_id].score += 1
            self.palette = (self.palette + 1) % PALETTE_COUNT
            self.foods.remove(cell)
        if eaten:
            self._fill_food(FOOD_FOR_PLAYERS.get(len(self.order), 4))

        self._turned.clear()

        if self.alive_count <= self._survivors_needed:
            self.status = MultiStatus.FINISHED

    # --- death ------------------------------------------------------------

    def _deaths(
        self, alive: list[MultiplayerPlayer], targets: dict[str, Cell]
    ) -> set[str]:
        """Everyone who does not survive this tick, from the pre-move snapshot.

        Four rules, all read-only, all applied to every snake before any of them
        moves. A snake killed here still occupies its cells for the purposes of
        the other rules: it is on the board at the instant of the crash.
        """
        doomed: set[str] = set()

        for player in alive:
            target = targets[player.player_id]

            # The wall, and its own body. `hits_self` forgives the last cell,
            # because a snake's own tail vacates as its head arrives.
            if hits_wall(target, self.width, self.height) or hits_self(
                target, player.snake.cells
            ):
                doomed.add(player.player_id)
                continue

            # Anyone else's body, tail included. There is no cross-snake tail
            # forgiveness: whether their tail vacates depends on whether *they*
            # ate this tick, and food is not resolved yet. Waiting for it would
            # make one snake's death depend on another's meal, which is exactly
            # the ordering this method exists to avoid.
            for other in alive:
                if other is not player and target in other.snake.cells:
                    doomed.add(player.player_id)
                    break

        # Two heads into one cell: nobody gets there first, so nobody gets
        # there. This is also what settles a contested apple - see `_award_food`.
        shared = Counter(targets.values())
        doomed.update(pid for pid, target in targets.items() if shared[target] > 1)

        # Swapping places. Already covered by the body rule above, since each
        # head is aimed at a cell the other snake currently occupies - but the
        # case is worth naming, because it is the one players argue about.
        for first, second in combinations(alive, 2):
            if (
                targets[first.player_id] == second.snake.head
                and targets[second.player_id] == first.snake.head
            ):
                doomed.add(first.player_id)
                doomed.add(second.player_id)

        return doomed

    # --- food -------------------------------------------------------------

    def _award_food(
        self, survivors: list[MultiplayerPlayer], targets: dict[str, Cell]
    ) -> dict[str, Cell]:
        """Which survivor eats which apple.

        Survivors are walked in slot order, which is join order - a fixed,
        server-assigned sequence that no client can influence. In practice the
        tie-break never fires: two snakes aiming at one cell have already died
        to the head-on rule, so at most one survivor can be pointed at any given
        apple. The loop is written to be total anyway, so the rule is stated
        rather than implied by an argument about another rule.
        """
        claimed: dict[str, Cell] = {}
        taken: set[Cell] = set()
        for player in sorted(survivors, key=lambda p: p.slot):
            target = targets[player.player_id]
            if target in self.foods and target not in taken:
                claimed[player.player_id] = target
                taken.add(target)
        return claimed

    def _fill_food(self, wanted: int) -> None:
        """Top the board back up to `wanted` apples, on safe cells only."""
        while len(self.foods) < wanted:
            cell = self._free_cell()
            if cell is None:
                return
            self.foods.append(cell)

    def _free_cell(self) -> Cell | None:
        """A cell no snake and no apple is on. `None` when there is none.

        The border is excluded, exactly as in the solo game: an apple flush
        against a wall can only be reached by steering at the wall behind it.
        Sampling from the free cells rather than retrying random guesses means a
        nearly-full board still terminates.
        """
        occupied = {cell for player in self.order if player.alive for cell in player.snake.cells}
        occupied.update(self.foods)

        free = [
            (x, y)
            for y in range(1, self.height - 1)
            for x in range(1, self.width - 1)
            if (x, y) not in occupied
        ]
        return self._rng.choice(free) if free else None

    # --- the result -------------------------------------------------------

    def rankings(self) -> list[dict[str, Any]]:
        """Final places, best first.

        Survival first, score second - outlasting the room beats out-eating it,
        because the round is a last-one-standing contest and the score is the
        tie-break inside a single death. Players level on both share a place,
        and the shared place consumes the slots behind it: 1, 1, 3.
        """

        def key(player: MultiplayerPlayer) -> tuple[float, int]:
            survived = math.inf if player.alive else float(player.died_at_tick or 0)
            return (survived, player.score)

        ordered = sorted(self.order, key=key, reverse=True)

        rankings: list[dict[str, Any]] = []
        previous: tuple[float, int] | None = None
        place = 0
        for index, player in enumerate(ordered, start=1):
            current = key(player)
            if current != previous:
                place = index
                previous = current
            rankings.append(
                {
                    "place": place,
                    "player_id": player.player_id,
                    "nickname": player.nickname,
                    "color": player.color,
                    "score": player.score,
                    "alive": player.alive,
                }
            )
        return rankings

    # --- what the browser sees --------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """The wire format. Keep in sync with `MultiplayerState` in
        web/types/game.ts."""
        return {
            "type": "game_state",
            "width": self.width,
            "height": self.height,
            "status": self.status.value,
            "ticks": self.ticks,
            "palette": self.palette,
            "food": [[x, y] for x, y in self.foods],
            "snakes": [
                {
                    "player_id": player.player_id,
                    "nickname": player.nickname,
                    "color": player.color,
                    "alive": player.alive,
                    "score": player.score,
                    "direction": player.direction.name,
                    "cells": [[x, y] for x, y in player.cells],
                }
                for player in self.order
            ],
            "alive": self.alive_count,
            "total": len(self.order),
        }
