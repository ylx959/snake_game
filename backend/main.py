"""Server entrypoint.

Wiring only, and less of it than there used to be. The rules live in `game/`,
the rooms in `room/`, the client protocol in `protocol.py`, and what any one
message means in `connection.py`. This file hands each socket a session, runs
the two tasks a socket needs, and sweeps up.

There is still no lock anywhere in here. Everything runs on one event loop, so
a room's clock and its players' command pumps never observe a half-updated
`GameRoom` - the C++ version's `gameMutex` has no counterpart. That is also why
a room's clock is a single task: one place in the process advances a game, so
no player can be on a different tick from anyone else in their room.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from connection import Connection
from leaderboard.repository import repository_from_env
from room.manager import RoomManager
from room.session import PlayerSession
from transport import QueueOutbox, pump

DEFAULT_PORT = 8000

#: How often abandoned rooms are swept up. A room also gets swept the moment
#: its last player leaves; this catches the lobby that was opened and forgotten.
SWEEP_SECONDS = 60.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Process-wide state: the rooms, the score store, and the janitor."""
    app.state.rooms = RoomManager()
    app.state.scores = repository_from_env()
    janitor = asyncio.create_task(_sweep_rooms(app.state.rooms))
    try:
        yield
    finally:
        janitor.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await janitor
        app.state.scores.close()


app = FastAPI(title="snake game-server", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


async def _sweep_rooms(rooms: RoomManager) -> None:
    while True:
        await asyncio.sleep(SWEEP_SECONDS)
        rooms.sweep()


@app.websocket("/ws")
async def play(websocket: WebSocket) -> None:
    """One player's session: an outbox writer, and a command pump."""
    await websocket.accept()

    outbox = QueueOutbox()
    session = PlayerSession(outbox=outbox)
    handler = Connection(session, websocket.app.state.rooms, websocket.app.state.scores)

    # The writer is a task of its own so that a broadcast - which happens inside
    # a room's synchronous method - never has to await a socket, and one slow
    # client can never hold up a room's tick.
    writer = asyncio.create_task(pump(websocket, outbox))
    handler.greet()

    try:
        while True:
            await handler.handle(await websocket.receive_text())
    except WebSocketDisconnect:
        pass
    finally:
        # Idempotent, and it has to be: a socket can report its own death more
        # than once, and `close()` may already have run.
        await handler.close()
        writer.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await writer


def _port_from_environment() -> int:
    value = os.environ.get("PORT")
    if value is None:
        return DEFAULT_PORT
    if value.isdigit() and 0 < int(value) < 65536:
        return int(value)
    print(f"ignoring invalid PORT={value}")
    return DEFAULT_PORT


if __name__ == "__main__":
    import uvicorn

    # Loopback only, like the C++ server: this is a local dev toy, not a service.
    uvicorn.run(app, host="127.0.0.1", port=_port_from_environment())
