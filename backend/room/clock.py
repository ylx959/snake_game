"""A room's clock. One per round, never one per player.

This is the only asynchronous thing in the room layer. It calls into the
synchronous state machine in `room.room` on a timer and broadcasts the result,
which is what makes every rule in there testable without an event loop.

The single task is the fairness guarantee made concrete: there is exactly one
place in the process that can advance a room's game, so two players cannot be
on different ticks, and a player sending more messages cannot buy more of them.

The beat is kept against an absolute schedule, not by sleeping for a tick after
each one. `next_beat` is why, and the solo clock in `connection.py` uses it for
the same reason.
"""

from __future__ import annotations

import asyncio
import contextlib

from protocol import countdown

from .room import GameRoom, RoomStatus


def next_beat(previous: float, now: float, interval: float) -> float:
    """When the next tick is due, on an absolute schedule.

    Sleeping for `interval` *after* doing the work is the obvious loop and the
    wrong one: the real period becomes `interval` plus however long the tick and
    the broadcast took, plus whatever the event loop was busy with. None of
    those is constant, so the clock does not merely run slow - it runs
    *unevenly*, and that lands on every player's screen as a snake that hurries
    and hesitates. Counting from a deadline instead means the work has to take
    longer than a whole tick before it can move the next one at all.

    A beat missed by more than a whole interval is not made up. The process was
    suspended, or the machine was oversubscribed; firing the backlog would run
    the game at several cells a tick to catch up, which is worse for everybody
    than a clock that simply carries on from here.
    """
    target = previous + interval
    if now - target > interval:
        return now + interval
    return target


async def run_round(room: GameRoom) -> None:
    """Count down, tick until somebody has won, then post the results."""
    try:
        for remaining in range(room.countdown_seconds, 0, -1):
            room.broadcast(countdown(room.code, remaining))
            await asyncio.sleep(1)

        room.begin_play()
        _broadcast_state(room)

        loop = asyncio.get_running_loop()
        deadline = loop.time()

        while room.status is RoomStatus.RUNNING and room.game is not None:
            deadline = next_beat(deadline, loop.time(), room.game.tick_seconds)
            await asyncio.sleep(max(0.0, deadline - loop.time()))
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
