"""One connected player.

A session is the server's handle on a browser: an unguessable id, whatever
nickname that browser last claimed, and somewhere to put messages for it.

Outgoing messages go through an `Outbox` rather than straight down a socket.
That is what keeps the room layer synchronous and socket-free: a room can
broadcast from inside an ordinary method call, the transport drains the outbox
on its own schedule, and a test reads `sent` instead of standing up a server.
"""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

#: Long enough that guessing another player's id is not a strategy. The player
#: never sees it, types it, or needs to know it exists.
PLAYER_ID_BYTES = 16


def new_player_id() -> str:
    """An unpredictable, per-connection identity.

    This - never the nickname - is how the server knows who did something. Two
    players in different rooms may share a name; they can never share this.
    """
    return secrets.token_urlsafe(PLAYER_ID_BYTES)


class Outbox(Protocol):
    """Somewhere to put a message for one player."""

    def put(self, payload: dict[str, Any]) -> None: ...


class MemoryOutbox:
    """An outbox that just remembers. The default, and what tests read."""

    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    def put(self, payload: dict[str, Any]) -> None:
        self.sent.append(payload)


@dataclass
class PlayerSession:
    """One browser, for as long as its socket is open."""

    outbox: Outbox = field(default_factory=MemoryOutbox)
    player_id: str = field(default_factory=new_player_id)
    nickname: str | None = None
    #: The room this session is in, or `None` in the menus or in solo.
    room_code: str | None = None
    ready: bool = False
    connected: bool = True
    #: Handed out by the room, unique within it. An index; the hex is the
    #: browser's, in web/lib/palette.ts.
    color: int = 0
    joined_at: float = field(default_factory=time.monotonic)

    def send(self, payload: dict[str, Any]) -> None:
        """Queue one message. Never blocks, and never raises on a dead socket -
        a player leaving mid-broadcast must not take the room down with them."""
        if self.connected:
            self.outbox.put(payload)
