"""Every room on the server, and the only thing allowed to create or destroy one.

Rooms live in memory. A room is a handful of sessions and one game, it is worth
nothing once everyone has gone, and a server restart with players mid-round is
not a case worth carrying a database for - so there is nothing here to persist.
The leaderboard, which does outlive a process, has its own store.
"""

from __future__ import annotations

import time

from .codes import generate_code
from .room import IDLE_TTL_SECONDS, GameRoom, RoomError, RoomStatus
from .session import PlayerSession

#: A ceiling on `create()`'s search for a free code. With 32**6 codes this is
#: never reached; it exists so a bug cannot turn into a hung event loop.
_CODE_ATTEMPTS = 50


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, GameRoom] = {}

    @property
    def codes(self) -> list[str]:
        """Every live room code. Deliberately not `__len__`: a manager that
        went falsy when it happened to be empty would make `manager or
        RoomManager()` quietly build a second one."""
        return list(self._rooms)

    def get(self, code: str) -> GameRoom | None:
        return self._rooms.get(code)

    def create(self, session: PlayerSession) -> GameRoom:
        """Open a room with this player as its host."""
        room = GameRoom(self._free_code())
        self._rooms[room.code] = room
        room.add(session)  # the first player in is the host
        return room

    def join(self, code: str, session: PlayerSession) -> GameRoom:
        """Put a player into an existing room, or say why not."""
        room = self._rooms.get(code)
        if room is None:
            raise RoomError("room_not_found")
        room.add(session)
        return room

    def leave(self, session: PlayerSession) -> GameRoom | None:
        """Take a player out of whichever room they are in. Safe to call twice.

        Returns the room they left, so the caller can broadcast the new lobby
        to whoever is still in it - unless it emptied, in which case it is gone.
        """
        code = session.room_code
        if code is None:
            return None
        room = self._rooms.get(code)
        session.room_code = None
        if room is None:
            return None

        room.remove(session.player_id)
        if room.is_empty:
            self._discard(room)
            return None
        return room

    def sweep(self, now: float | None = None) -> list[str]:
        """Drop empty and long-idle rooms. Returns the codes that went.

        Called on a timer and after anyone leaves, so a code is never held by a
        room nobody is in.
        """
        now = time.monotonic() if now is None else now
        gone = [
            room.code
            for room in list(self._rooms.values())
            if room.is_empty or room.is_expired(now, IDLE_TTL_SECONDS)
        ]
        for code in gone:
            room = self._rooms.get(code)
            if room is not None:
                self._discard(room)
        return gone

    # --- internals --------------------------------------------------------

    def _free_code(self) -> str:
        for _ in range(_CODE_ATTEMPTS):
            code = generate_code()
            if code not in self._rooms:
                return code
        raise RoomError("room_unavailable")

    def _discard(self, room: GameRoom) -> None:
        room.status = RoomStatus.EMPTY
        for player in room.order:
            player.room_code = None
        self._rooms.pop(room.code, None)
