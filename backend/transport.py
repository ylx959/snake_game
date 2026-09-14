"""The socket end of a player's outbox.

A room broadcasts by putting dictionaries into sessions' outboxes, from inside
ordinary synchronous methods. This is the piece that takes them out again and
writes them to a WebSocket, on its own task.

Splitting it this way is what keeps `room/` free of both asyncio and JSON: a
broadcast can never block on a slow client, and a player whose connection has
stalled is dropped rather than allowed to hold up everyone else's tick.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

#: How many messages may queue for one player before the server gives up on
#: them. At eight ticks a second this is several seconds of backlog: a client
#: that far behind is gone, not slow, and dropping the oldest frame would only
#: hand it a stale board.
OUTBOX_LIMIT = 64


class QueueOutbox:
    """An `Outbox` that a socket writer drains."""

    def __init__(self, limit: int = OUTBOX_LIMIT) -> None:
        self.queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=limit)
        self.overflowed = False

    def put(self, payload: dict[str, Any]) -> None:
        """Never blocks and never raises - a broadcast runs inside a room's
        own method call, and one dead client must not break it."""
        try:
            self.queue.put_nowait(payload)
        except asyncio.QueueFull:
            self.overflowed = True


async def pump(websocket: Any, outbox: QueueOutbox) -> None:
    """Write queued messages to the socket until cancelled."""
    while True:
        payload = await outbox.queue.get()
        await websocket.send_text(json.dumps(payload))
