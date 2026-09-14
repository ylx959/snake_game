"""Several snakes, one board, one clock.

Everything here runs without a socket, a room or an event loop - the rules are
values and pure functions, exactly like the solo ones.
"""

import pytest

from game.multiplayer import (
    FOOD_FOR_PLAYERS,
    MultiplayerGame,
    MultiStatus,
)
from game.snake import Direction, Snake
from game.spawns import MAX_PLAYERS, MULTI_HEIGHT, MULTI_WIDTH, spawns_for

pytestmark = pytest.mark.multiplayer


def new_game(count=2, seed=1, **kwargs) -> MultiplayerGame:
    players = [(f"p{i}", f"PLAYER{i}") for i in range(count)]
    return MultiplayerGame(players, seed=seed, **kwargs)


def running(count=2, **kwargs) -> MultiplayerGame:
    game = new_game(count, **kwargs)
    game.begin()
    return game


def place(game, player_id, head, direction, length=3) -> Snake:
    """Drop a snake somewhere specific, the way the solo tests place food."""
    snake = Snake(head, direction, length)
    game.players[player_id].snake = snake
    return snake


def coiled_onto_itself(head=(4, 6)) -> Snake:
    """A five-long snake wrapped so its next head lands on its own body."""
    snake = Snake(head, Direction.RIGHT, length=5)
    for direction in (Direction.UP, Direction.RIGHT, Direction.DOWN):
        snake.turn(direction)
        snake.move()
    snake.turn(Direction.LEFT)
    return snake


# --- spawns ---------------------------------------------------------------


@pytest.mark.parametrize("count", [2, 3, 4, 5])
def test_every_supported_count_has_a_spawn_for_each_player(count):
    spawns = spawns_for(count)
    assert len(spawns) == count


@pytest.mark.parametrize("count", [2, 3, 4, 5])
def test_spawned_snakes_are_on_the_board_and_never_overlap(count):
    game = new_game(count)
    seen: set[tuple[int, int]] = set()
    for player in game.order:
        for x, y in player.snake.cells:
            assert 0 <= x < MULTI_WIDTH and 0 <= y < MULTI_HEIGHT
            assert (x, y) not in seen  # no two snakes share a cell
            seen.add((x, y))


@pytest.mark.parametrize("count", [2, 3, 4, 5])
def test_every_spawn_faces_the_middle(count):
    """A snake pointed at the nearest wall would be dead before it could turn."""
    game = new_game(count)
    centre_x, centre_y = MULTI_WIDTH / 2, MULTI_HEIGHT / 2
    for player in game.order:
        head_x, head_y = player.snake.head
        dx, dy = player.snake.direction.value
        # The step must close the distance to the middle on its own axis.
        if dx:
            assert (centre_x - head_x) * dx > 0
        else:
            assert (centre_y - head_y) * dy > 0


@pytest.mark.parametrize("count", [2, 3, 4, 5])
def test_a_snake_can_take_its_first_step_without_dying(count):
    game = running(count)
    game.tick()
    assert game.alive_count == count


def test_no_spawn_layout_is_invented_for_an_unsupported_count():
    with pytest.raises(ValueError):
        spawns_for(MAX_PLAYERS + 1)


def test_spawn_slots_and_colours_are_handed_out_in_join_order():
    game = new_game(5)
    assert [p.slot for p in game.order] == [0, 1, 2, 3, 4]
    assert len({p.color for p in game.order}) == 5


# --- the countdown --------------------------------------------------------


def test_a_new_game_is_counting_down_and_nothing_moves():
    game = new_game()
    assert game.status is MultiStatus.COUNTDOWN
    before = [p.snake.cells for p in game.order]
    game.tick()
    assert [p.snake.cells for p in game.order] == before
    assert game.ticks == 0


def test_a_new_room_game_advances_on_a_100ms_clock():
    game = new_game()
    assert game.tick_seconds == 0.12


def test_a_direction_pressed_during_the_countdown_is_held_not_played():
    game = new_game()
    head_before = game.players["p0"].snake.head
    game.turn("p0", Direction.UP)
    assert game.players["p0"].snake.head == head_before  # still standing still

    game.begin()
    game.tick()
    assert game.players["p0"].snake.direction is Direction.UP


def test_begin_starts_the_clock():
    game = new_game()
    game.begin()
    assert game.status is MultiStatus.RUNNING


# --- one turn per player per tick ----------------------------------------


def test_only_the_first_valid_turn_of_a_tick_is_taken():
    game = running()
    place(game, "p0", (10, 10), Direction.RIGHT)

    assert game.turn("p0", Direction.UP) is True
    assert game.turn("p0", Direction.DOWN) is False  # too late, this tick

    game.tick()
    assert game.players["p0"].snake.direction is Direction.UP
    # The next tick accepts one again.
    assert game.turn("p0", Direction.RIGHT) is True


def test_a_reversal_is_refused_and_does_not_use_up_the_turn():
    game = running()
    place(game, "p0", (10, 10), Direction.RIGHT)

    assert game.turn("p0", Direction.LEFT) is False
    assert game.turn("p0", Direction.UP) is True

    game.tick()
    assert game.players["p0"].snake.direction is Direction.UP


def test_a_dead_player_cannot_steer():
    game = running()
    game.players["p0"].alive = False
    assert game.turn("p0", Direction.UP) is False


def test_an_unknown_player_id_is_ignored():
    game = running()
    assert game.turn("nobody", Direction.UP) is False


# --- death ----------------------------------------------------------------


def test_a_snake_that_runs_off_the_board_dies():
    game = running(width=24, height=12)
    place(game, "p0", (23, 5), Direction.RIGHT)
    place(game, "p1", (4, 9), Direction.LEFT)

    game.tick()

    assert game.players["p0"].alive is False
    assert game.players["p1"].alive is True


def test_a_snake_that_runs_into_itself_dies():
    game = running(width=24, height=12)
    game.players["p0"].snake = coiled_onto_itself()
    place(game, "p1", (18, 9), Direction.LEFT)

    game.tick()

    assert game.players["p0"].alive is False
    assert game.players["p1"].alive is True


def test_running_into_another_snakes_body_kills_only_the_one_that_ran():
    game = running(width=24, height=12)
    # p1 lies vertically across p0's path, its body trailing downwards from
    # (6,7); p0 is one cell short of the segment at (6,8).
    place(game, "p1", (6, 7), Direction.UP, length=5)
    place(game, "p0", (5, 8), Direction.RIGHT)

    game.tick()

    assert game.players["p0"].alive is False
    assert game.players["p1"].alive is True


def test_two_heads_entering_the_same_cell_kill_both():
    game = running(width=24, height=12)
    place(game, "p0", (5, 5), Direction.RIGHT)
    place(game, "p1", (7, 5), Direction.LEFT)

    game.tick()

    assert game.players["p0"].alive is False
    assert game.players["p1"].alive is False


def test_three_heads_entering_the_same_cell_kill_all_three():
    game = running(3, width=24, height=12)
    place(game, "p0", (5, 6), Direction.RIGHT)
    place(game, "p1", (7, 6), Direction.LEFT)
    place(game, "p2", (6, 5), Direction.DOWN)

    game.tick()

    assert [p.alive for p in game.order] == [False, False, False]


def test_two_snakes_swapping_heads_both_die():
    game = running(width=24, height=12)
    place(game, "p0", (5, 5), Direction.RIGHT)
    place(game, "p1", (6, 5), Direction.LEFT)

    game.tick()

    assert game.players["p0"].alive is False
    assert game.players["p1"].alive is False


def test_death_is_decided_before_anything_moves():
    """p1 would escape if p0 moved first and vacated the cell."""
    game = running(width=24, height=12)
    place(game, "p0", (5, 5), Direction.RIGHT, length=3)  # body (5,5),(4,5),(3,5)
    place(game, "p1", (4, 6), Direction.UP)  # next head is (4,5)

    game.tick()

    # (4,5) is p0's second segment on the snapshot, so p1 dies even though p0
    # moves off it on this very tick.
    assert game.players["p1"].alive is False
    assert game.players["p0"].alive is True


def test_a_dead_snake_leaves_the_board():
    game = running(width=24, height=12)
    place(game, "p0", (23, 5), Direction.RIGHT)
    game.tick()

    assert game.players["p0"].alive is False
    payload = game.to_dict()
    dead = next(s for s in payload["snakes"] if s["player_id"] == "p0")
    assert dead["cells"] == []
    assert dead["alive"] is False


def test_a_dead_snake_no_longer_blocks_the_survivors():
    # Three players, so the round does not end the moment the first one dies.
    game = running(3, width=24, height=12)
    place(game, "p0", (23, 5), Direction.RIGHT)  # dies into the wall at once
    place(game, "p1", (19, 5), Direction.RIGHT)  # two cells clear of p0's tail
    place(game, "p2", (5, 10), Direction.LEFT)
    game.foods = []

    game.tick()
    assert game.players["p0"].alive is False
    assert game.players["p1"].alive is True

    # p0's body lay across (21,5), (22,5) and (23,5). p1 now walks through it.
    for _ in range(3):
        game.tick()
    assert game.players["p1"].snake.head == (23, 5)
    assert game.players["p1"].alive is True


# --- food -----------------------------------------------------------------


@pytest.mark.parametrize("count,expected", sorted(FOOD_FOR_PLAYERS.items()))
def test_the_board_carries_one_apple_count_per_player_count(count, expected):
    game = new_game(count)
    assert len(game.foods) == expected


def test_apples_never_start_on_a_snake():
    for count in (2, 3, 4, 5):
        game = new_game(count)
        occupied = {cell for p in game.order for cell in p.snake.cells}
        assert not (set(game.foods) & occupied)
        assert len(set(game.foods)) == len(game.foods)  # and never stacked


def test_eating_scores_grows_and_replaces_the_apple():
    game = running(width=24, height=12)
    place(game, "p0", (5, 5), Direction.RIGHT)
    game.foods = [(6, 5)]

    game.tick()

    assert game.players["p0"].score == 1
    assert len(game.players["p0"].snake) == 4
    assert (6, 5) not in game.foods
    # The board is topped straight back up to its full complement.
    assert len(game.foods) == FOOD_FOR_PLAYERS[2]


def test_a_player_who_leaves_mid_round_dies_where_they_stood():
    game = running(width=24, height=12)

    assert game.kill("p1") is True

    assert game.players["p1"].alive is False
    assert game.players["p1"].died_at_tick == game.ticks


def test_killing_the_same_player_twice_changes_nothing():
    """A socket can report its own death more than once."""
    game = running(width=24, height=12)
    game.kill("p1")

    assert game.kill("p1") is False


def test_an_apple_two_snakes_reach_together_is_eaten_by_neither():
    """Contested apples resolve through the head-on rule, not arrival order.

    Two heads entering one cell is already fatal to both, so the apple sitting
    in that cell simply survives. The outcome is the same whichever player's
    message reached the server first.
    """
    game = running(width=24, height=12)
    place(game, "p0", (5, 5), Direction.RIGHT)
    place(game, "p1", (7, 5), Direction.LEFT)
    game.foods = [(6, 5)]

    game.tick()

    assert game.players["p0"].score == 0
    assert game.players["p1"].score == 0
    assert game.foods == [(6, 5)]
    assert game.alive_count == 0


def test_message_order_cannot_change_who_eats():
    def play(order):
        game = running(width=24, height=12, seed=7)
        place(game, "p0", (5, 5), Direction.RIGHT)
        place(game, "p1", (5, 9), Direction.RIGHT)
        game.foods = [(6, 5), (6, 9)]
        for player_id in order:
            game.turn(player_id, Direction.RIGHT)
        game.tick()
        return {p.player_id: p.score for p in game.order}

    assert play(["p0", "p1"]) == play(["p1", "p0"])


def test_a_replacement_apple_never_lands_on_a_snake():
    game = running(width=24, height=12)
    game.foods = [game.players["p0"].snake.next_head()]

    game.tick()

    occupied = {cell for p in game.order if p.alive for cell in p.snake.cells}
    assert not (set(game.foods) & occupied)


# --- the end --------------------------------------------------------------


def test_the_game_ends_when_one_player_is_left():
    game = running(3, width=24, height=12)
    place(game, "p0", (23, 5), Direction.RIGHT)
    place(game, "p1", (23, 8), Direction.RIGHT)
    place(game, "p2", (5, 5), Direction.RIGHT)

    game.tick()

    assert game.alive_count == 1
    assert game.status is MultiStatus.FINISHED


def test_the_game_does_not_end_while_two_are_left():
    game = running(3, width=24, height=12)
    place(game, "p0", (23, 5), Direction.RIGHT)
    game.tick()
    assert game.status is MultiStatus.RUNNING


def test_a_finished_game_stops_advancing():
    game = running(width=24, height=12)
    place(game, "p0", (23, 5), Direction.RIGHT)
    place(game, "p1", (23, 8), Direction.RIGHT)
    game.tick()
    assert game.status is MultiStatus.FINISHED

    before = [p.snake.cells for p in game.order]
    ticks = game.ticks
    game.tick()
    assert [p.snake.cells for p in game.order] == before
    assert game.ticks == ticks


def test_the_last_survivor_comes_first():
    game = running(3, width=24, height=12)
    place(game, "p0", (23, 5), Direction.RIGHT)
    place(game, "p1", (23, 8), Direction.RIGHT)
    place(game, "p2", (5, 5), Direction.RIGHT)
    game.tick()

    rankings = game.rankings()
    assert rankings[0]["player_id"] == "p2"
    assert rankings[0]["place"] == 1
    assert rankings[0]["alive"] is True


def test_surviving_longer_beats_a_higher_score():
    game = running(3, width=24, height=12)
    place(game, "p0", (23, 5), Direction.RIGHT)
    game.players["p0"].score = 99
    place(game, "p1", (5, 8), Direction.RIGHT)
    place(game, "p2", (5, 5), Direction.RIGHT)

    game.tick()  # p0 dies first
    place(game, "p1", (23, 8), Direction.RIGHT)
    game.tick()  # p1 dies second, p2 is left

    assert [r["player_id"] for r in game.rankings()] == ["p2", "p1", "p0"]


def test_everyone_dying_together_is_ranked_by_score():
    game = running(3, width=24, height=12)
    for player_id, row in (("p0", 5), ("p1", 8), ("p2", 10)):
        place(game, player_id, (23, row), Direction.RIGHT)
    game.players["p0"].score = 1
    game.players["p1"].score = 5
    game.players["p2"].score = 3

    game.tick()

    assert game.alive_count == 0
    assert game.status is MultiStatus.FINISHED
    assert [r["player_id"] for r in game.rankings()] == ["p1", "p2", "p0"]
    assert [r["place"] for r in game.rankings()] == [1, 2, 3]


def test_players_tied_on_everything_share_a_place():
    game = running(3, width=24, height=12)
    for player_id, row in (("p0", 5), ("p1", 8), ("p2", 10)):
        place(game, player_id, (23, row), Direction.RIGHT)
    game.players["p0"].score = 4
    game.players["p1"].score = 4
    game.players["p2"].score = 1

    game.tick()

    # Competition ranking: 1, 1, 3 - the shared place consumes both slots.
    assert [r["place"] for r in game.rankings()] == [1, 1, 3]


# --- the wire -------------------------------------------------------------


def test_the_payload_has_exactly_the_fields_the_browser_expects():
    assert set(new_game().to_dict()) == {
        "type",
        "width",
        "height",
        "status",
        "ticks",
        "food",
        "snakes",
        "alive",
        "total",
    }


def test_each_snake_carries_what_the_scoreboard_needs():
    payload = new_game().to_dict()
    assert set(payload["snakes"][0]) == {
        "player_id",
        "nickname",
        "color",
        "alive",
        "score",
        "direction",
        "cells",
    }


def test_it_is_tagged_as_a_game_state_message():
    assert new_game().to_dict()["type"] == "game_state"


def test_cells_and_food_serialize_as_two_element_arrays():
    import json

    payload = json.loads(json.dumps(new_game().to_dict()))
    assert all(len(cell) == 2 for cell in payload["food"])
    assert all(len(cell) == 2 for snake in payload["snakes"] for cell in snake["cells"])


def test_the_alive_count_is_reported_alongside_the_total():
    game = running(3, width=24, height=12)
    place(game, "p0", (23, 5), Direction.RIGHT)
    game.tick()
    payload = game.to_dict()
    assert payload["alive"] == 2
    assert payload["total"] == 3
