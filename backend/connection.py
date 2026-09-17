"""One player's connection: which mode they are in, and what each message means.

This is the only place that knows about all of the game, the rooms and the
leaderboard at once, and it is deliberately the only place. `game/` does not
know about rooms; `room/` does not know about sockets or the leaderboard;
`protocol.py` has no side effects at all.

A connection is in exactly one of three modes:

    MENU   nothing running; the menus and the leaderboard
    SOLO   one `Game` and one clock, exactly as the game has always worked
    GROUP  a member of a `GameRoom`, whose clock is the room's, not this one's

Everything that can end a connection - a close frame, a dead socket, a browser
tab closing - funnels into `close()`, which is idempotent: a socket can report
its own death more than once, and cleaning up twice must not remove a player
twice or cancel a task that has already gone.
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from enum import Enum

import protocol
from game.command import Resize, Start
from game.command import apply as apply_solo
from game.game import Game, GameStatus
from leaderboard.repository import LeaderboardRepository
from room.clock import cancel_round, next_beat, start_round
from room.manager import RoomManager
from room.nickname import clean_nickname
from room.room import GameRoom, RoomError, RoomStatus
from room.session import PlayerSession

#: A token bucket, refilled continuously. Steering is the only thing a player
#: sends at any rate, and at eight ticks a second even a frantic player is well
#: under this; anything above it is a script.
RATE_LIMIT_PER_SECOND = 30.0
RATE_LIMIT_BURST = 60.0


class Mode(str, Enum):
    MENU = "menu"
    SOLO = "solo"
    GROUP = "group"


class Connection:
    def __init__(
        self,
        session: PlayerSession,
        rooms: RoomManager,
        scores: LeaderboardRepository,
    ) -> None:
        self.session = session
        self.rooms = rooms
        self.scores = scores

        self.mode = Mode.MENU
        self.solo: Game | None = None
        self._solo_clock: asyncio.Task[None] | None = None
        #: One finished run writes one row. Cleared by a reset or a new game.
        self._solo_recorded = False

        self._closed = False
        self._tokens = RATE_LIMIT_BURST
        self._refilled_at = time.monotonic()

    # --- the socket's two entry points ------------------------------------

    def greet(self) -> None:
        """The first two frames: proof the server is up, then the menus."""
        self.session.send(protocol.loading())
        self.session.send(protocol.menu_ready(self.session.player_id, self.session.nickname))

    async def handle(self, text: str) -> None:
        """One message in. Never raises for anything a client can send."""
        if not self._allow():
            self.session.send(protocol.error("rate_limited"))
            return

        command = protocol.parse(text)
        if command is None:
            return  # noise, or a stale client: ignore it and keep the socket

        match command:
            case protocol.SetNickname(nickname):
                await self._set_nickname(nickname)
            case protocol.GetLeaderboard(limit):
                await self._send_leaderboard(limit)

            case protocol.CreateRoom(nickname):
                await self._create_room(nickname)
            case protocol.JoinRoom(code, nickname):
                await self._join_room(code, nickname)
            case protocol.LeaveRoom():
                self._leave_room()
                self.session.send(
                    protocol.menu_ready(self.session.player_id, self.session.nickname)
                )
            case protocol.Ready(ready):
                self._set_ready(ready)
            case protocol.StartRoom():
                self._start_room()
            case protocol.PlayAgain():
                self._play_again()

            case protocol.Turn(direction):
                self._turn(direction)

            case protocol.SoloEnter(nickname):
                await self._solo_enter(nickname)
            case protocol.Solo(verb):
                self._solo_command(verb)
            case protocol.SoloExit():
                self._leave_solo()
                self.session.send(
                    protocol.menu_ready(self.session.player_id, self.session.nickname)
                )

    async def close(self) -> None:
        """Tear the connection down. Safe to call more than once."""
        if self._closed:
            return
        self._closed = True
        self.session.connected = False

        await self._stop_solo_clock()
        self._leave_room()
        self.rooms.sweep()

    # --- identity ---------------------------------------------------------

    async def _set_nickname(self, raw: str) -> bool:
        """Claim a display name. False when it was refused and the player told.

        A nickname is never an identity - `session.player_id` is, and the client
        cannot choose or change it - so changing a name mid-session is harmless,
        except inside a room, where it would make the lobby lie.

        The last check is the only one that needs the database: a name sitting
        in the visible top ten is spoken for, so nobody else can turn up playing
        under it. It is deliberately a *live* lookup rather than a cached set -
        the table moves every time somebody finishes a run, and a stale list
        would either reserve a name that has dropped off or let one through that
        just arrived.
        """
        if self.session.room_code is not None:
            self.session.send(protocol.error("already_started"))
            return False

        cleaned = clean_nickname(raw)
        if cleaned.nickname is None:
            self.session.send(protocol.error(cleaned.error or "nickname_invalid"))
            return False

        reserved = await asyncio.to_thread(self.scores.reserved_nicknames)
        if cleaned.nickname.casefold() in reserved:
            self.session.send(protocol.error("nickname_reserved"))
            return False

        self.session.nickname = cleaned.nickname
        self.session.send(protocol.nickname_set(cleaned.nickname))
        return True

    async def _require_nickname(self, offered: str | None) -> bool:
        """Take the name the message carried, or fall back to the session's."""
        if offered is not None:
            return await self._set_nickname(offered)
        if self.session.nickname is None:
            self.session.send(protocol.error("nickname_required"))
            return False
        return True

    # --- the leaderboard --------------------------------------------------

    async def _send_leaderboard(self, limit: int, last_score: int | None = None) -> None:
        # `to_thread`, because a disk that stalls must not stall the event loop
        # every room's clock is running on.
        entries = await asyncio.to_thread(self.scores.top, limit)
        self.session.send(
            protocol.leaderboard([entry.to_dict() for entry in entries], last_score)
        )

    async def _record_solo_run(self) -> None:
        """Write one finished solo run, once.

        The score comes from this server's own `Game`, which the browser cannot
        reach. There is no client message that carries a score, so there is
        nothing for a client to inflate - and the flag makes a second write
        impossible even if a bug ticked a finished game again.
        """
        game = self.solo
        if game is None or self._solo_recorded or self.session.nickname is None:
            return
        self._solo_recorded = True
        await asyncio.to_thread(self.scores.record, self.session.nickname, game.score)
        await self._send_leaderboard(protocol.GetLeaderboard(10).limit, last_score=game.score)

    # --- solo -------------------------------------------------------------

    async def _solo_enter(self, nickname: str | None) -> None:
        """Open the solo board. Does **not** start the game.

        The board goes back READY: the snake standing in the middle, the prompt
        over it, waiting. That pause is the game's opening - the run begins on
        the player's first arrow key, which is what `Game.turn()` has always
        done. Starting here instead would drop the player straight into a moving
        snake they never asked to move.

        The name is settled here rather than in a separate message the browser
        races against this one: this run's score is going on a public table, so
        a refused name has to stop the run before it exists.
        """
        if not await self._require_nickname(nickname):
            return

        self._leave_room()
        self._leave_solo()  # drop any previous run, and its clock with it

        self.solo = Game()
        self.mode = Mode.SOLO
        self._solo_recorded = False
        self._start_solo_clock()
        self.session.send(self.solo.to_dict())

    def _solo_command(self, verb: object) -> None:
        # A reshape only means something to a game that exists; it is not a way
        # to start one.
        if isinstance(verb, Resize) and self.solo is None:
            return
        if self.session.nickname is None:
            self.session.send(protocol.error("nickname_required"))
            return
        if self.mode is Mode.GROUP:
            self._leave_room()

        if self.solo is None:
            self.solo = Game()
            self.mode = Mode.SOLO
            self._solo_recorded = False
            self._start_solo_clock()

        was_over = self.solo.status is GameStatus.GAME_OVER
        apply_solo(verb, self.solo)  # type: ignore[arg-type]
        if was_over and self.solo.status is not GameStatus.GAME_OVER:
            self._solo_recorded = False  # a reset is a new run
        self.session.send(self.solo.to_dict())

    def _start_solo_clock(self) -> None:
        if self._solo_clock is None or self._solo_clock.done():
            self._solo_clock = asyncio.create_task(self._run_solo_clock())

    async def _run_solo_clock(self) -> None:
        """The solo clock: unchanged in every respect that matters, except that
        a finished run now writes its score.

        It keeps an absolute beat for the same reason a room's does - see
        `room.clock.next_beat`. One player is no less able to see an uneven
        tick than five.
        """
        game = self.solo
        assert game is not None
        loop = asyncio.get_running_loop()
        deadline = loop.time()
        while True:
            deadline = next_beat(deadline, loop.time(), game.tick_seconds)
            await asyncio.sleep(max(0.0, deadline - loop.time()))
            before = game.status
            game.tick()
            self.session.send(game.to_dict())
            if game.status is GameStatus.GAME_OVER and before is not GameStatus.GAME_OVER:
                await self._record_solo_run()

    async def _stop_solo_clock(self) -> None:
        task, self._solo_clock = self._solo_clock, None
        if task is None:
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    def _leave_solo(self) -> None:
        if self._solo_clock is not None:
            self._solo_clock.cancel()
            self._solo_clock = None
        self.solo = None
        self._solo_recorded = False
        if self.mode is Mode.SOLO:
            self.mode = Mode.MENU

    # --- rooms ------------------------------------------------------------

    async def _create_room(self, nickname: str | None) -> None:
        if not await self._require_nickname(nickname):
            return
        self._leave_solo()
        self._leave_room()

        try:
            room = self.rooms.create(self.session)
        except RoomError as refused:
            self.session.send(protocol.error(refused.code))
            return

        self.mode = Mode.GROUP
        self.session.send(protocol.room_created(room.lobby_state()))

    async def _join_room(self, code: str, nickname: str | None) -> None:
        if not code:
            self.session.send(protocol.error("bad_code"))
            return
        if not await self._require_nickname(nickname):
            return
        self._leave_solo()
        self._leave_room()

        try:
            room = self.rooms.join(code, self.session)
        except RoomError as refused:
            self.session.send(protocol.error(refused.code))
            return

        self.mode = Mode.GROUP
        self.session.send(protocol.room_joined(room.lobby_state()))
        # Everyone else hears about the arrival, then sees the new lobby.
        for player in room.order:
            if player.player_id != self.session.player_id:
                player.send(
                    protocol.player_joined(
                        self.session.player_id, self.session.nickname, self.session.color
                    )
                )
        room.broadcast(room.lobby_state())

    def _room(self) -> GameRoom | None:
        code = self.session.room_code
        return self.rooms.get(code) if code is not None else None

    def _leave_room(self) -> None:
        """Take this player out of whatever room they are in. Idempotent."""
        room = self._room()
        self.rooms.leave(self.session)
        if self.mode is Mode.GROUP:
            self.mode = Mode.MENU
        if room is None:
            return

        if room.is_empty or room.status is RoomStatus.EMPTY:
            cancel_round(room)
            return

        room.broadcast(protocol.player_left(self.session.player_id, self.session.nickname))
        room.broadcast(room.lobby_state())
        # A round that has just lost its second-to-last player ends on its own
        # next tick; nothing here needs to reach into the clock to do it.

    def _set_ready(self, ready: bool) -> None:
        room = self._room()
        if room is None:
            self.session.send(protocol.error("not_in_room"))
            return
        room.set_ready(self.session.player_id, ready)
        room.broadcast(room.lobby_state())

    def _start_room(self) -> None:
        room = self._room()
        if room is None:
            self.session.send(protocol.error("not_in_room"))
            return
        try:
            room.request_start(self.session.player_id)
        except RoomError as refused:
            self.session.send(protocol.error(refused.code))
            return

        room.broadcast(room.lobby_state())
        start_round(room)  # the room's one clock, from here until the result

    def _play_again(self) -> None:
        """Back to the lobby, same room, same code.

        Any player in the room may ask, not only the host: the host may have
        left on the results screen, and a room nobody can move off it is worse
        than one where anyone can say "again". Starting the next round is still
        the host's alone.
        """
        room = self._room()
        if room is None:
            self.session.send(protocol.error("not_in_room"))
            return
        if room.status is not RoomStatus.RESULTS:
            self.session.send(protocol.error("already_started"))
            return

        cancel_round(room)
        room.return_to_lobby()
        room.broadcast(room.lobby_state())

    # --- steering ---------------------------------------------------------

    def _turn(self, direction: object) -> None:
        """One key press, routed to whichever game this connection is in.

        A spectator's key presses land here and go nowhere: `GameRoom.turn`
        asks the game, and the game refuses a turn from a dead player. The
        browser also stops sending them, but the server does not rely on that.
        """
        if self.mode is Mode.GROUP:
            room = self._room()
            if room is not None:
                room.turn(self.session.player_id, direction)  # type: ignore[arg-type]
            return

        if self.solo is not None:
            self.solo.turn(direction)  # type: ignore[arg-type]

    # --- rate limiting ----------------------------------------------------

    def _allow(self) -> bool:
        """A token bucket. Refills continuously, so a burst is forgiven and a
        sustained flood is not."""
        now = time.monotonic()
        self._tokens = min(
            RATE_LIMIT_BURST,
            self._tokens + (now - self._refilled_at) * RATE_LIMIT_PER_SECOND,
        )
        self._refilled_at = now
        if self._tokens < 1.0:
            return False
        self._tokens -= 1.0
        return True
