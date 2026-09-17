"""Codes, lobbies, the host, and the room lifecycle.

`GameRoom` is deliberately synchronous: every state change here is a plain
method call, and the only asynchronous thing in the room layer is the clock that
calls `tick()`. So none of this needs an event loop.
"""

import pytest

from game.multiplayer import MultiStatus
from game.snake import Direction
from room.clock import next_beat
from room.codes import CODE_ALPHABET, CODE_LENGTH, generate_code, normalise_code
from room.manager import RoomManager
from room.nickname import MAX_NICKNAME, MIN_NICKNAME, clean_nickname
from room.room import MAX_PLAYERS, MIN_PLAYERS, GameRoom, RoomError, RoomStatus
from room.session import MemoryOutbox, PlayerSession

pytestmark = pytest.mark.room


def session(nickname="PLAYER") -> PlayerSession:
    return PlayerSession(outbox=MemoryOutbox(), nickname=nickname)


def room_with(count, manager=None) -> tuple[GameRoom, list[PlayerSession]]:
    manager = RoomManager() if manager is None else manager
    sessions = [session(f"PLAYER{i}") for i in range(count)]
    room = manager.create(sessions[0])
    for extra in sessions[1:]:
        manager.join(room.code, extra)
    return room, sessions


def playing(count=2) -> tuple[GameRoom, list[PlayerSession]]:
    room, sessions = room_with(count)
    room.start_round(seed=1)
    room.begin_play()
    return room, sessions


# --- nicknames ------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected", [("ylx", "ylx"), ("  ab  ", "ab"), ("a" * 12, "a" * 12)]
)
def test_a_good_nickname_survives_cleaning(raw, expected):
    assert clean_nickname(raw).nickname == expected


def test_surrounding_whitespace_is_stripped():
    assert clean_nickname("   snake   ").nickname == "snake"


def test_runs_of_inner_whitespace_collapse_to_one_space():
    assert clean_nickname("big   red").nickname == "big red"


@pytest.mark.parametrize("raw", ["", " ", "   ", "a"])
def test_blank_and_too_short_names_are_refused(raw):
    result = clean_nickname(raw)
    assert result.nickname is None
    assert result.error is not None


def test_an_over_long_name_is_refused_rather_than_truncated():
    result = clean_nickname("a" * (MAX_NICKNAME + 1))
    assert result.nickname is None
    assert result.error == "nickname_too_long"


@pytest.mark.parametrize("raw", [None, 42, ["x"], {"a": 1}])
def test_a_nickname_that_is_not_text_is_refused(raw):
    assert clean_nickname(raw).nickname is None


def test_control_and_direction_override_characters_are_refused():
    # A NUL would break a log line; a right-to-left override lets a name
    # reorder the text around it in the lobby.
    assert clean_nickname("ab" + chr(0) + "cd").nickname is None
    assert clean_nickname("ab" + chr(0x202E) + "cd").nickname is None


def test_obvious_profanity_is_refused():
    assert clean_nickname("fuck").error == "nickname_blocked"
    assert clean_nickname("F U C K").error == "nickname_blocked"


def test_the_bounds_are_the_documented_ones():
    assert (MIN_NICKNAME, MAX_NICKNAME) == (2, 12)


# --- room codes -----------------------------------------------------------


def test_a_code_is_six_characters_from_the_unambiguous_alphabet():
    code = generate_code()
    assert len(code) == CODE_LENGTH == 6
    assert all(character in CODE_ALPHABET for character in code)


@pytest.mark.parametrize("character", "OI01")
def test_the_alphabet_leaves_out_the_look_alikes(character):
    assert character not in CODE_ALPHABET


def test_codes_do_not_repeat_across_a_run_of_rooms():
    manager = RoomManager()
    codes = {manager.create(session()).code for _ in range(200)}
    assert len(codes) == 200


def test_a_code_is_normalised_before_it_is_looked_up():
    assert normalise_code("  abcdef  ") == "ABCDEF"
    assert normalise_code("abc") is None
    assert normalise_code("ABCDE0") is None  # 0 is not in the alphabet
    assert normalise_code(42) is None


def test_the_server_makes_the_code_not_the_client():
    manager = RoomManager()
    room = manager.create(session())
    assert manager.get(room.code) is room


# --- joining and leaving --------------------------------------------------


def test_the_first_player_in_is_the_host():
    room, sessions = room_with(3)
    assert room.host_id == sessions[0].player_id


def test_a_room_holds_five_and_refuses_the_sixth():
    manager = RoomManager()
    room, _ = room_with(MAX_PLAYERS, manager)
    assert len(room.players) == MAX_PLAYERS

    with pytest.raises(RoomError) as refused:
        manager.join(room.code, session("LATE"))
    assert refused.value.code == "room_full"


def test_a_nickname_already_in_the_room_is_refused():
    manager = RoomManager()
    room = manager.create(session("ylx"))
    with pytest.raises(RoomError) as refused:
        manager.join(room.code, session("YLX"))  # case does not rescue it
    assert refused.value.code == "nickname_taken"


def test_the_same_nickname_is_fine_in_a_different_room():
    manager = RoomManager()
    first = manager.create(session("ylx"))
    second = manager.create(session("ylx"))
    assert first.code != second.code
    assert len(second.players) == 1


def test_an_unknown_code_is_refused():
    manager = RoomManager()
    with pytest.raises(RoomError) as refused:
        manager.join("ZZZZZZ", session())
    assert refused.value.code == "room_not_found"


def test_a_room_already_playing_cannot_be_joined():
    manager = RoomManager()
    room, _ = room_with(2, manager)
    room.start_round(seed=1)
    with pytest.raises(RoomError) as refused:
        manager.join(room.code, session("LATE"))
    assert refused.value.code == "room_in_progress"


def test_leaving_removes_the_player():
    room, sessions = room_with(3)
    room.remove(sessions[1].player_id)
    assert sessions[1].player_id not in room.players
    assert len(room.players) == 2


def test_removing_the_same_player_twice_is_harmless():
    room, sessions = room_with(3)
    room.remove(sessions[1].player_id)
    room.remove(sessions[1].player_id)  # a second disconnect callback
    assert len(room.players) == 2


def test_the_host_leaving_hands_the_room_to_the_earliest_player_left():
    room, sessions = room_with(4)
    room.remove(sessions[0].player_id)
    assert room.host_id == sessions[1].player_id
    room.remove(sessions[2].player_id)  # not the host, so nothing moves
    assert room.host_id == sessions[1].player_id
    room.remove(sessions[1].player_id)
    assert room.host_id == sessions[3].player_id


def test_the_last_player_out_empties_the_room():
    manager = RoomManager()
    room, sessions = room_with(2, manager)
    for player in sessions:
        manager.leave(player)
    assert room.status is RoomStatus.EMPTY
    assert manager.get(room.code) is None


def test_an_idle_waiting_room_expires():
    manager = RoomManager()
    room, _ = room_with(2, manager)
    room.touched_at = 0.0
    assert manager.sweep(now=10_000.0) == [room.code]
    assert manager.get(room.code) is None


def test_a_busy_room_is_not_swept():
    manager = RoomManager()
    room, _ = room_with(2, manager)
    assert manager.sweep(now=room.touched_at + 1.0) == []
    assert manager.get(room.code) is room


# --- starting -------------------------------------------------------------


def test_only_the_host_may_start():
    room, sessions = room_with(3)
    with pytest.raises(RoomError) as refused:
        room.request_start(sessions[1].player_id)
    assert refused.value.code == "not_host"
    assert room.status is RoomStatus.WAITING


def test_a_room_of_one_may_not_start():
    room, sessions = room_with(1)
    with pytest.raises(RoomError) as refused:
        room.request_start(sessions[0].player_id)
    assert refused.value.code == "not_enough_players"
    assert MIN_PLAYERS == 2


def test_the_host_starting_puts_the_room_into_the_countdown():
    room, sessions = room_with(2)
    room.request_start(sessions[0].player_id)
    assert room.status is RoomStatus.COUNTDOWN
    assert room.game is not None
    assert room.game.status is MultiStatus.COUNTDOWN


def test_starting_twice_is_refused():
    room, sessions = room_with(2)
    room.request_start(sessions[0].player_id)
    with pytest.raises(RoomError) as refused:
        room.request_start(sessions[0].player_id)
    assert refused.value.code == "already_started"


def test_everyone_plays_on_one_game_and_one_clock():
    room, sessions = playing(3)
    # There is exactly one game object, and every player is in it.
    assert {p.player_id for p in room.game.order} == {s.player_id for s in sessions}

    before = room.game.ticks
    room.tick()
    assert room.game.ticks == before + 1
    # One call advanced every snake - there is no per-player clock to fall out
    # of step with.
    assert all(len(p.snake) == 3 for p in room.game.order)


def test_the_room_reports_the_countdown_length():
    room, sessions = room_with(2)
    room.request_start(sessions[0].player_id)
    assert room.countdown_seconds == 3


# --- playing --------------------------------------------------------------


def test_a_turn_reaches_the_shared_game():
    room, sessions = playing(2)
    assert room.turn(sessions[0].player_id, Direction.UP) is True
    room.tick()
    assert room.game.players[sessions[0].player_id].snake.direction is Direction.UP


def test_a_turn_from_somebody_not_in_the_room_is_ignored():
    room, _ = playing(2)
    assert room.turn("stranger", Direction.UP) is False


def test_disconnecting_mid_round_kills_that_snake_but_keeps_the_round():
    room, sessions = playing(3)
    room.remove(sessions[1].player_id)

    assert room.game.players[sessions[1].player_id].alive is False
    assert room.status is RoomStatus.RUNNING
    assert room.game.alive_count == 2


def test_the_round_ends_when_one_player_is_left():
    room, sessions = playing(3)
    room.remove(sessions[1].player_id)
    room.remove(sessions[2].player_id)
    room.tick()
    assert room.status is RoomStatus.RESULTS


def test_results_rank_everyone_who_played():
    room, sessions = playing(2)
    room.remove(sessions[0].player_id)
    room.tick()
    payload = room.results()
    assert payload["type"] == "results"
    assert len(payload["rankings"]) == 2
    assert payload["rankings"][0]["player_id"] == sessions[1].player_id


def test_play_again_returns_the_room_to_its_lobby_with_the_same_code():
    room, sessions = playing(2)
    code = room.code
    room.remove(sessions[0].player_id)
    room.tick()
    assert room.status is RoomStatus.RESULTS

    room.return_to_lobby()

    assert room.status is RoomStatus.WAITING
    assert room.code == code
    assert room.game is None


def test_the_host_can_start_another_round_from_the_results():
    manager = RoomManager()
    room, sessions = room_with(2, manager)
    room.start_round(seed=1)
    room.begin_play()
    room.remove(sessions[0].player_id)
    room.tick()
    room.return_to_lobby()
    manager.join(room.code, session("BACK"))  # the room is open again

    assert len(room.players) == 2
    room.request_start(room.host_id)
    assert room.status is RoomStatus.COUNTDOWN


# --- what the lobby looks like -------------------------------------------


def test_the_lobby_payload_carries_what_the_screen_shows():
    room, sessions = room_with(3)
    payload = room.lobby_state()

    assert payload["type"] == "lobby_state"
    assert payload["code"] == room.code
    assert payload["host_id"] == sessions[0].player_id
    assert payload["count"] == 3
    assert payload["capacity"] == MAX_PLAYERS
    assert payload["status"] == "waiting"
    assert [p["nickname"] for p in payload["players"]] == ["PLAYER0", "PLAYER1", "PLAYER2"]
    assert [p["color"] for p in payload["players"]] == [0, 1, 2]
    assert all(p["ready"] is False for p in payload["players"])


def test_every_player_in_a_room_has_a_different_colour():
    room, _ = room_with(5)
    colours = [p["color"] for p in room.lobby_state()["players"]]
    assert len(set(colours)) == MAX_PLAYERS


def test_a_colour_freed_by_a_leaver_is_handed_to_the_next_arrival():
    manager = RoomManager()
    room, sessions = room_with(3, manager)
    freed = room.players[sessions[1].player_id].color
    room.remove(sessions[1].player_id)
    manager.join(room.code, session("NEW"))
    assert room.order[-1].color == freed
    assert len({p.color for p in room.order}) == 3


def test_ready_is_reported_back():
    room, sessions = room_with(2)
    room.set_ready(sessions[1].player_id, True)
    assert room.lobby_state()["players"][1]["ready"] is True
    room.set_ready(sessions[1].player_id, False)
    assert room.lobby_state()["players"][1]["ready"] is False


def test_broadcast_reaches_every_player():
    room, sessions = room_with(3)
    room.broadcast({"type": "hello"})
    for player in sessions:
        assert player.outbox.sent[-1] == {"type": "hello"}


# --- identity -------------------------------------------------------------


def test_player_ids_are_unpredictable_and_unique():
    ids = {session().player_id for _ in range(500)}
    assert len(ids) == 500
    assert all(len(player_id) >= 16 for player_id in ids)


def test_a_player_is_found_by_id_and_never_by_nickname():
    room, sessions = room_with(2)
    assert room.players[sessions[0].player_id] is sessions[0]
    assert sessions[0].nickname not in room.players


# --- the beat -------------------------------------------------------------


def test_the_beat_is_absolute_and_does_not_drift():
    # Each tick takes 30ms of real work. Sleeping a whole interval afterwards
    # would put the clock 30ms further behind on every single tick; counting
    # from a deadline, the work is simply absorbed.
    interval, work = 0.12, 0.03
    deadline, now = 0.0, 0.0

    for beat in range(1, 51):
        deadline = next_beat(deadline, now, interval)
        now = deadline + work  # woke on time, then did the tick
        assert deadline == pytest.approx(beat * interval)


def test_a_beat_missed_by_more_than_a_tick_is_not_made_up():
    # The process was held up for a second. The backlog is dropped rather than
    # fired off back to back, which would run the game at several cells a tick.
    interval = 0.12
    deadline = next_beat(0.0, 0.0, interval)
    assert deadline == pytest.approx(interval)

    late = deadline + 1.0
    assert next_beat(deadline, late, interval) == pytest.approx(late + interval)


def test_a_tick_that_ran_long_only_eats_into_its_own_slack():
    # Late, but by less than a whole interval: the schedule is kept, so the
    # next tick comes early rather than the clock slipping for good.
    interval = 0.12
    deadline = next_beat(0.0, 0.0, interval)
    slightly_late = deadline + interval * 0.5
    assert next_beat(deadline, slightly_late, interval) == pytest.approx(2 * interval)
