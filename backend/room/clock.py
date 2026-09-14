"""A room's clock. One per round, never one per player.

This is the only asynchronous thing in the room layer. It calls into the
synchronous state machine in `room.room` on a timer and broadcasts the result,
which is what makes every rule in there testable without an event loop.

The single task is the fairness guarantee made concrete: there is exactly one
place in the process that can advance a room's game, so two players cannot be
on different ticks, and a player sending more messages cannot buy more of them.
"""

from __future__ import annotations

import asyncio
import contextlib

from protocol import countdown

from .room import GameRoom, RoomStatus


async def run_round(room: GameRoom) -> None:
    """Count down, tick until somebody has won, then post the results."""
    try:
        for remaining in range(room.countdown_seconds, 0, -1):
            room.broadcast(countdown(room.code, remaining))
            await asyncio.sleep(1)

        room.begin_play()
        _broadcast_state(room)

        while room.status is RoomStatus.RUNNING and room.game is not None:
            await asyncio.sleep(room.game.tick_seconds)
            room.tick()
            _broadcast_state(room)

        # Only a round that actually finished has a result. A room that emptied
        # mid-play has nobody to tell.
        if room.status is RoomStatus.RESULTS:
            room.broadcast(room.results())
    finally:
        room.task = None


def _broadcast_state(room: GameRoom) -> None:
    state = room.game_state()
    if state is not None:
        room.broadcast(state)


def start_round(room: GameRoom) -> None:
    """Put the room's clock on the event loop, replacing any previous one."""
    cancel_round(room)
    room.task = asyncio.create_task(run_round(room))


def cancel_round(room: GameRoom) -> None:
    """Stop the clock. Safe to call on a room that has none.

    A socket can report its own death more than once, and a room can empty
    while its own `finally` is already running, so this has to tolerate being
    called twice - and must never cancel a task that has already cleared itself.
    """
    task, room.task = room.task, None
    if task is not None and not task.done():
        task.cancel()


async def drain(room: GameRoom) -> None:
    """Await a cancelled clock, for tests and for an orderly shutdown."""
    task = room.task
    if task is not None:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
