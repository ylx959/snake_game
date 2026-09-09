"""Server entrypoint.

Wiring only. The rules live in `game/`, the client protocol in `game/command.py`.
This file's job is to hand each connection its own `Game`, pump commands into
it, and push state out at the tick rate.

There is no lock anywhere in here. Everything runs on one event loop, so the
ticker and the command pump never observe a half-updated `Game` - the C++
version's `gameMutex` has no counterpart.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from game.command import apply, parse_command
from game.game import Game

DEFAULT_PORT = 8000

app = FastAPI(title="snake game-server")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


async def _push_states(websocket: WebSocket, game: Game) -> None:
    """The server-side clock. This is the only place state advances."""
    while True:
        await asyncio.sleep(game.tick_seconds)
        game.tick()
        await websocket.send_text(json.dumps(game.to_dict()))


@app.websocket("/ws")
async def play(websocket: WebSocket) -> None:
    """One player's session: a game, a clock pushing state, a command pump."""
    await websocket.accept()
    game = Game()
    await websocket.send_text(json.dumps(game.to_dict()))

    ticker = asyncio.create_task(_push_states(websocket, game))
    try:
        while True:
            command = parse_command(await websocket.receive_text())
            if command is None:
                continue  # unrecognised message: ignore it, keep the socket
            apply(command, game)
    except WebSocketDisconnect:
        pass
    finally:
        # Cancelling ends the clock at once rather than one tick later.
        ticker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await ticker


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
