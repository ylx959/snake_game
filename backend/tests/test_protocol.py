"""The full client/server contract: parsing, dispatch, and the socket itself.

Three layers, tested at the level each one actually lives at:

- `protocol.parse`, a pure function, with no game and no socket;
- `Connection`, driven directly, with a `MemoryOutbox` instead of a WebSocket;
- the real app over a real WebSocket, for the things only a socket can break.
"""

import asyncio
import json
import os

import pytest

import protocol
from connection import RATE_LIMIT_BURST, Connection, Mode
from game.command import Pause, Reset, Resize, Start
from game.game import GameStatus
from game.snake import Direction
from leaderboard.repository import SqliteLeaderboardRepository
from room.manager import RoomManager
from room.room import RoomStatus
from room.session import MemoryOutbox, PlayerSession

pytestmark = pytest.mark.protocol


# --- parsing --------------------------------------------------------------


@pytest.mark.parametrize(
    "text,expected",
    [
        ('{"type":"set_nickname","nickname":"ylx"}', protocol.SetNickname("ylx")),
        ('{"type":"create_room","nickname":"ylx"}', protocol.CreateRoom("ylx")),
        ('{"type":"create_room"}', protocol.CreateRoom(None)),
        ('{"type":"join_room","code":"abcdef"}', protocol.JoinRoom("ABCDEF", None)),
        ('{"type":"leave_room"}', protocol.LeaveRoom()),
        ('{"type":"ready","ready":true}', protocol.Ready(True)),
        ('{"type":"ready","ready":false}', protocol.Ready(False)),
        ('{"type":"start_room"}', protocol.StartRoom()),
        ('{"type":"play_again"}', protocol.PlayAgain()),
        ('{"type":"turn","direction":"LEFT"}', protocol.Turn(Direction.LEFT)),
        ('{"type":"solo_start"}', protocol.Solo(Start())),
        ('{"type":"solo_pause"}', protocol.Solo(Pause())),
        ('{"type":"solo_reset"}', protocol.Solo(Reset())),
        ('{"type":"solo_exit"}', protocol.SoloExit()),
        ('{"type":"resize","width":56,"height":24}', protocol.Solo(Resize(56, 24))),
        ('{"type":"get_leaderboard","limit":25}', protocol.GetLeaderboard(25)),
    ],
)
def test_every_client_message_parses(text, expected):
    assert protocol.parse(text) == expected


def test_a_room_code_is_normalised_on_the_way_in():
    assert protocol.parse('{"type":"join_room","code":"  abc234 "}') == protocol.JoinRoom(
        "ABC234", None
    )


def test_an_unreadable_code_still_produces_a_join_so_the_player_is_told():
    # Silence would look like a dropped message. An empty code can never match
    # a real room, so the handler answers "that is not a room code".
    assert protocol.parse('{"type":"join_room","code":"@@"}') == protocol.JoinRoom("", None)


@pytest.mark.parametrize(
    "text",
    [
        "",
        "not json",
        "{",
        "[]",
        "42",
        "null",
        '"a string"',
        "{}",
        '{"type":42}',
        '{"type":"fly"}',
        '{"type":"turn"}',
        '{"type":"turn","direction":"NORTH"}',
        '{"type":"turn","direction":7}',
        '{"type":"set_nickname"}',
        '{"type":"set_nickname","nickname":42}',
        '{"type":"ready"}',
        '{"type":"ready","ready":"yes"}',  # a string is not a boolean
        '{"type":"ready","ready":1}',      # and neither is 1
        '{"type":"resize","width":56}',    # only half a board
        '{"type":"resize","width":"56","height":24}',
        # `bool` is an `int` in Python, so this one needs its own guard.
        '{"type":"resize","width":true,"height":24}',
    ],
)
def test_malformed_text_is_rejected_rather_than_raising(text):
    assert protocol.parse(text) is None


def test_an_oversized_message_is_refused_before_it_is_parsed():
    huge = json.dumps({"type": "set_nickname", "nickname": "a" * protocol.MAX_MESSAGE_BYTES})
    assert len(huge) > protocol.MAX_MESSAGE_BYTES
    assert protocol.parse(huge) is None


def test_a_nonsense_leaderboard_limit_falls_back_rather_than_failing():
    assert protocol.parse('{"type":"get_leaderboard","limit":-4}') == protocol.GetLeaderboard(10)
    assert protocol.parse('{"type":"get_leaderboard","limit":true}') == protocol.GetLeaderboard(10)


def test_an_error_says_what_happened_and_nothing_about_the_server():
    payload = protocol.error("room_full")
    assert payload == {"type": "error", "code": "room_full", "message": "Room is full"}


def test_an_unknown_error_code_still_produces_a_safe_message():
    payload = protocol.error("kaboom")
    assert payload["type"] == "error"
    assert "kaboom" == payload["code"]
    assert payload["message"] == "Something went wrong"


def test_the_menus_are_told_the_shape_of_both_boards():
    payload = protocol.menu_ready("pid", "ylx")
    assert payload["you"] == "pid"
    assert payload["config"]["solo"] == {"width": 48, "height": 27}
    assert payload["config"]["multi"] == {"width": 64, "height": 36}
    assert payload["config"]["max_players"] == 5
    assert payload["config"]["min_players"] == 2


def test_the_first_frame_proves_the_server_is_up():
    assert protocol.loading() == {"type": "loading", "protocol": protocol.PROTOCOL_VERSION}


# --- driving a connection -------------------------------------------------


class Harness:
    """A handful of connections sharing one room manager and one score store."""

    def __init__(self):
        self.rooms = RoomManager()
        self.scores = SqliteLeaderboardRepository(":memory:")
        self.made: list[Connection] = []

    def connect(self, nickname=None) -> Connection:
        session = PlayerSession(outbox=MemoryOutbox())
        handler = Connection(session, self.rooms, self.scores)
        handler.greet()
        if nickname is not None:
            session.nickname = nickname
        self.made.append(handler)
        return handler

    def close(self):
        self.scores.close()


@pytest.fixture
def harness():
    made = Harness()
    yield made
    made.close()


def sent(handler: Connection) -> list[dict]:
    return handler.session.outbox.sent


def types(handler: Connection) -> list[str]:
    return [message["type"] for message in sent(handler)]


def last(handler: Connection, message_type: str) -> dict:
    for message in reversed(sent(handler)):
        if message["type"] == message_type:
            return message
    raise AssertionError(f"no {message_type} in {types(handler)}")


async def send(handler: Connection, **message) -> None:
    await handler.handle(json.dumps(message))


def test_a_fresh_connection_is_greeted_then_shown_the_menu(harness):
    handler = harness.connect()
    assert types(handler) == ["loading", "menu_ready"]


def test_a_nickname_is_accepted_and_echoed(harness):
    handler = harness.connect()
    asyncio.run(send(handler, type="set_nickname", nickname="  ylx  "))
    assert last(handler, "nickname_set")["nickname"] == "ylx"
    assert handler.session.nickname == "ylx"


def test_a_refused_nickname_says_which_rule_it_broke(harness):
    handler = harness.connect()
    asyncio.run(send(handler, type="set_nickname", nickname="a"))
    assert last(handler, "error")["code"] == "nickname_too_short"
    assert handler.session.nickname is None


def test_a_room_cannot_be_made_without_a_nickname(harness):
    handler = harness.connect()
    asyncio.run(send(handler, type="create_room"))
    assert last(handler, "error")["code"] == "nickname_required"
    assert harness.rooms.codes == []


def test_creating_a_room_returns_a_server_made_code(harness):
    host = harness.connect("HOST")
    asyncio.run(send(host, type="create_room"))

    created = last(host, "room_created")
    assert len(created["code"]) == 6
    assert created["lobby"]["host_id"] == host.session.player_id
    assert created["lobby"]["count"] == 1
    assert host.mode is Mode.GROUP


def test_joining_tells_the_joiner_and_everybody_already_there(harness):
    host = harness.connect("HOST")
    asyncio.run(send(host, type="create_room"))
    code = last(host, "room_created")["code"]

    guest = harness.connect("GUEST")
    asyncio.run(send(guest, type="join_room", code=code))

    assert last(guest, "room_joined")["code"] == code
    assert last(host, "player_joined")["nickname"] == "GUEST"
    assert last(host, "lobby_state")["count"] == 2


@pytest.mark.parametrize(
    "code,expected", [("ZZZZZZ", "room_not_found"), ("@@", "bad_code"), ("", "bad_code")]
)
def test_a_join_that_cannot_work_says_so_plainly(harness, code, expected):
    guest = harness.connect("GUEST")
    asyncio.run(send(guest, type="join_room", code=code))
    assert last(guest, "error")["code"] == expected


def test_a_sixth_player_is_turned_away(harness):
    host = harness.connect("HOST")
    asyncio.run(send(host, type="create_room"))
    code = last(host, "room_created")["code"]
    for index in range(4):
        asyncio.run(send(harness.connect(f"GUEST{index}"), type="join_room", code=code))

    late = harness.connect("LATE")
    asyncio.run(send(late, type="join_room", code=code))
    assert last(late, "error")["code"] == "room_full"


def test_a_duplicate_nickname_in_one_room_is_turned_away(harness):
    host = harness.connect("YLX")
    asyncio.run(send(host, type="create_room"))
    code = last(host, "room_created")["code"]

    twin = harness.connect("ylx")
    asyncio.run(send(twin, type="join_room", code=code))
    assert last(twin, "error")["code"] == "nickname_taken"


def test_only_the_host_may_start(harness):
    host = harness.connect("HOST")
    asyncio.run(send(host, type="create_room"))
    code = last(host, "room_created")["code"]
    guest = harness.connect("GUEST")
    asyncio.run(send(guest, type="join_room", code=code))

    asyncio.run(send(guest, type="start_room"))
    assert last(guest, "error")["code"] == "not_host"
    assert harness.rooms.get(code).status is RoomStatus.WAITING


def test_a_lone_host_may_not_start(harness):
    host = harness.connect("HOST")
    asyncio.run(send(host, type="create_room"))
    asyncio.run(send(host, type="start_room"))
    assert last(host, "error")["code"] == "not_enough_players"


def test_ready_is_broadcast_to_the_room(harness):
    host = harness.connect("HOST")
    asyncio.run(send(host, type="create_room"))
    code = last(host, "room_created")["code"]
    guest = harness.connect("GUEST")
    asyncio.run(send(guest, type="join_room", code=code))

    asyncio.run(send(guest, type="ready", ready=True))
    lobby = last(host, "lobby_state")
    assert [p["ready"] for p in lobby["players"]] == [False, True]


def test_a_host_start_counts_everyone_down_then_plays_one_shared_game(harness):
    async def scenario():
        host = harness.connect("HOST")
        await send(host, type="create_room")
        code = last(host, "room_created")["code"]
        guest = harness.connect("GUEST")
        await send(guest, type="join_room", code=code)

        room = harness.rooms.get(code)
        room.countdown_seconds = 1
        await send(host, type="start_room")
        await asyncio.sleep(1.4)  # the countdown, then a few ticks

        assert room.status is RoomStatus.RUNNING
        # Both players saw the same countdown and the same board.
        assert last(host, "countdown")["seconds"] == 1
        assert last(guest, "countdown")["seconds"] == 1
        assert last(host, "game_state")["snakes"] == last(guest, "game_state")["snakes"]
        assert last(host, "game_state")["ticks"] == last(guest, "game_state")["ticks"]

        await host.close()
        await guest.close()
        return room

    asyncio.run(scenario())


def test_a_turn_reaches_the_shared_game_and_a_spectators_does_not(harness):
    async def scenario():
        host = harness.connect("HOST")
        await send(host, type="create_room")
        code = last(host, "room_created")["code"]
        guest = harness.connect("GUEST")
        await send(guest, type="join_room", code=code)

        room = harness.rooms.get(code)
        room.countdown_seconds = 0
        await send(host, type="start_room")
        await asyncio.sleep(0.05)

        await send(host, type="turn", direction="UP")
        await asyncio.sleep(0.2)
        assert room.game.players[host.session.player_id].snake.direction is Direction.UP

        # Kill the guest, then let it keep pressing keys.
        room.game.players[guest.session.player_id].alive = False
        before = room.game.players[guest.session.player_id].snake.direction
        await send(guest, type="turn", direction="UP")
        assert room.game.players[guest.session.player_id].snake.direction is before

        await host.close()
        await guest.close()

    asyncio.run(scenario())


def test_leaving_the_lobby_takes_the_player_out_and_tells_the_rest(harness):
    host = harness.connect("HOST")
    asyncio.run(send(host, type="create_room"))
    code = last(host, "room_created")["code"]
    guest = harness.connect("GUEST")
    asyncio.run(send(guest, type="join_room", code=code))

    asyncio.run(send(guest, type="leave_room"))

    assert last(host, "player_left")["nickname"] == "GUEST"
    assert last(host, "lobby_state")["count"] == 1
    assert guest.mode is Mode.MENU
    assert last(guest, "menu_ready")["you"] == guest.session.player_id


def test_the_host_leaving_hands_the_room_on(harness):
    host = harness.connect("HOST")
    asyncio.run(send(host, type="create_room"))
    code = last(host, "room_created")["code"]
    guest = harness.connect("GUEST")
    asyncio.run(send(guest, type="join_room", code=code))

    asyncio.run(host.close())

    assert last(guest, "lobby_state")["host_id"] == guest.session.player_id


def test_the_last_player_out_takes_the_room_with_them(harness):
    host = harness.connect("HOST")
    asyncio.run(send(host, type="create_room"))
    code = last(host, "room_created")["code"]

    asyncio.run(host.close())

    assert harness.rooms.get(code) is None


def test_closing_a_connection_twice_is_harmless(harness):
    host = harness.connect("HOST")
    asyncio.run(send(host, type="create_room"))
    code = last(host, "room_created")["code"]
    guest = harness.connect("GUEST")
    asyncio.run(send(guest, type="join_room", code=code))

    asyncio.run(host.close())
    asyncio.run(host.close())  # a second disconnect callback

    assert last(guest, "lobby_state")["count"] == 1


def test_disconnecting_mid_round_kills_the_snake_and_ends_the_round(harness):
    async def scenario():
        host = harness.connect("HOST")
        await send(host, type="create_room")
        code = last(host, "room_created")["code"]
        guest = harness.connect("GUEST")
        await send(guest, type="join_room", code=code)

        room = harness.rooms.get(code)
        room.countdown_seconds = 0
        await send(host, type="start_room")
        await asyncio.sleep(0.05)

        await guest.close()
        await asyncio.sleep(0.3)

        assert room.game.players[guest.session.player_id].alive is False
        assert room.status is RoomStatus.RESULTS
        assert last(host, "results")["rankings"][0]["player_id"] == host.session.player_id

        await host.close()

    asyncio.run(scenario())


def test_play_again_returns_the_room_to_its_lobby_with_the_same_code(harness):
    async def scenario():
        host = harness.connect("HOST")
        await send(host, type="create_room")
        code = last(host, "room_created")["code"]
        guest = harness.connect("GUEST")
        await send(guest, type="join_room", code=code)

        room = harness.rooms.get(code)
        room.countdown_seconds = 0
        await send(host, type="start_room")
        await asyncio.sleep(0.05)
        room.game.players[guest.session.player_id].alive = False
        await asyncio.sleep(0.3)
        assert room.status is RoomStatus.RESULTS

        await send(host, type="play_again")
        assert room.status is RoomStatus.WAITING
        assert last(host, "lobby_state")["code"] == code

        await host.close()
        await guest.close()

    asyncio.run(scenario())


# --- solo and the leaderboard --------------------------------------------


def test_a_resize_does_not_start_a_solo_game(harness):
    # The command reshapes a board; it is not a way to get one.
    handler = harness.connect("YLX")
    asyncio.run(send(handler, type="resize", width=56, height=24))
    assert handler.solo is None


def test_a_resize_reaches_a_running_solo_game(harness):
    async def scenario():
        handler = harness.connect("YLX")
        await send(handler, type="solo_start")
        await send(handler, type="resize", width=56, height=24)
        assert (handler.solo.width, handler.solo.height) == (56, 24)
        await handler.close()

    asyncio.run(scenario())


def test_solo_needs_a_nickname_so_a_score_has_somewhere_to_go(harness):
    handler = harness.connect()
    asyncio.run(send(handler, type="solo_start"))
    assert last(handler, "error")["code"] == "nickname_required"
    assert handler.solo is None


def test_solo_start_hands_back_a_running_board(harness):
    async def scenario():
        handler = harness.connect("YLX")
        await send(handler, type="solo_start")
        state = last(handler, "state")
        assert state["status"] == "running"
        assert state["width"] == 48 and state["height"] == 27
        await handler.close()

    asyncio.run(scenario())


def test_a_finished_solo_run_is_written_to_the_leaderboard_by_the_server(harness):
    async def scenario():
        handler = harness.connect("YLX")
        await send(handler, type="solo_start")
        # Steer into the wall rather than waiting out a full board.
        handler.solo.score = 7
        handler.solo.snake._body[0] = (47, 13)
        await asyncio.sleep(0.4)

        assert handler.solo.status is GameStatus.GAME_OVER
        table = last(handler, "leaderboard")
        assert table["last_score"] == 7
        assert table["entries"][0]["nickname"] == "YLX"
        assert table["entries"][0]["score"] == 7
        await handler.close()

    asyncio.run(scenario())


def test_one_run_writes_one_row(harness):
    async def scenario():
        handler = harness.connect("YLX")
        await send(handler, type="solo_start")
        handler.solo.snake._body[0] = (47, 13)
        await asyncio.sleep(0.5)  # several ticks past the death
        await handler.close()
        return harness.scores.top()

    assert len(asyncio.run(scenario())) == 1


def test_there_is_no_client_message_that_carries_a_score():
    """The only route into the table is a finished, server-run game."""
    assert protocol.parse('{"type":"submit_score","score":9999}') is None
    assert protocol.parse('{"type":"leaderboard","score":9999}') is None


def test_the_leaderboard_can_be_asked_for_from_the_menu(harness):
    harness.scores.record("ylx", 12, achieved_at=100.0)
    handler = harness.connect()
    asyncio.run(send(handler, type="get_leaderboard", limit=10))
    table = last(handler, "leaderboard")
    assert table["entries"] == [
        {"rank": 1, "nickname": "ylx", "score": 12, "achieved_at": 100.0}
    ]
    assert table["last_score"] is None


# --- abuse ----------------------------------------------------------------


def test_a_flood_is_throttled_rather_than_served(harness):
    async def scenario():
        handler = harness.connect("YLX")
        for _ in range(int(RATE_LIMIT_BURST) + 20):
            await send(handler, type="turn", direction="UP")
        assert any(
            message["type"] == "error" and message["code"] == "rate_limited"
            for message in sent(handler)
        )

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "text",
    ["", "{", "[]", "null", '{"type":"turn","direction":null}', '{"type":123}', "\x00"],
)
def test_garbage_neither_crashes_the_handler_nor_answers_it(harness, text):
    async def scenario():
        handler = harness.connect("YLX")
        before = len(sent(handler))
        await handler.handle(text)
        assert len(sent(handler)) == before  # ignored, not answered

    asyncio.run(scenario())


# --- over a real socket ---------------------------------------------------


@pytest.fixture
def client(monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    import main

    with TestClient(main.app) as running:
        yield running


def test_health_answers(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_a_socket_is_greeted_with_loading_then_the_menu(client):
    with client.websocket_connect("/ws") as socket:
        assert socket.receive_json()["type"] == "loading"
        assert socket.receive_json()["type"] == "menu_ready"


def test_garbage_down_a_real_socket_does_not_close_it(client):
    with client.websocket_connect("/ws") as socket:
        socket.receive_json()
        socket.receive_json()
        for junk in ["", "{", "[]", "not json", '{"type":"fly"}', "x" * 4000]:
            socket.send_text(junk)
        # The socket is still there and still answering.
        socket.send_text(json.dumps({"type": "set_nickname", "nickname": "ylx"}))
        assert socket.receive_json() == {"type": "nickname_set", "nickname": "ylx"}


def test_two_real_sockets_share_one_room_and_one_board(client):
    with client.websocket_connect("/ws") as first, client.websocket_connect("/ws") as second:
        for socket in (first, second):
            socket.receive_json()  # loading
            socket.receive_json()  # menu_ready

        first.send_text(json.dumps({"type": "create_room", "nickname": "HOST"}))
        created = _await_type(first, "room_created")
        code = created["code"]

        second.send_text(json.dumps({"type": "join_room", "code": code, "nickname": "GUEST"}))
        joined = _await_type(second, "room_joined")
        assert joined["lobby"]["count"] == 2
        assert _await_type(first, "lobby_state")["count"] == 2


def _await_type(socket, message_type, limit=20):
    for _ in range(limit):
        message = socket.receive_json()
        if message["type"] == message_type:
            return message
    raise AssertionError(f"no {message_type} within {limit} messages")
