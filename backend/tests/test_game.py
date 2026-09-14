import pytest

from game.game import MAX_DIMENSION, MIN_DIMENSION, PALETTE_COUNT, Game, GameStatus
from game.snake import Direction

pytestmark = pytest.mark.game


def new_game(**kwargs) -> Game:
    return Game(seed=1, **kwargs)


def test_a_new_game_is_ready_with_food_on_the_board():
    game = new_game()
    assert game.status is GameStatus.READY
    assert game.score == 0
    assert game.ticks == 0
    assert game.palette == 0
    assert game.food is not None
    assert not game.snake.occupies(game.food)


def test_a_new_game_advances_on_a_100ms_clock():
    game = new_game()
    assert game.tick_seconds == 0.10


def test_nothing_advances_while_the_game_is_not_running():
    game = new_game()
    before = game.snake.cells
    game.tick()
    assert game.snake.cells == before
    assert game.ticks == 0


def test_start_resumes_from_ready_and_from_paused():
    game = new_game()
    game.start()
    assert game.status is GameStatus.RUNNING
    game.pause()
    assert game.status is GameStatus.PAUSED
    game.start()
    assert game.status is GameStatus.RUNNING


def test_pause_only_bites_while_running():
    game = new_game()
    game.pause()
    assert game.status is GameStatus.READY


def test_toggle_pause_is_the_space_key():
    game = new_game()
    game.start()
    game.toggle_pause()
    assert game.status is GameStatus.PAUSED
    game.toggle_pause()
    assert game.status is GameStatus.RUNNING


def test_a_turn_starts_the_game():
    game = new_game()
    game.turn(Direction.UP)
    assert game.status is GameStatus.RUNNING


def test_a_turn_is_ignored_once_the_game_is_over():
    game = new_game()
    game.status = GameStatus.GAME_OVER
    game.turn(Direction.UP)
    game.tick()
    assert game.status is GameStatus.GAME_OVER


def test_growth_score_and_palette_all_land_on_the_eating_tick():
    game = new_game()
    game.start()
    length = len(game.snake)
    game.food = game.snake.next_head()

    game.tick()

    assert game.score == 1
    assert len(game.snake) == length + 1
    assert game.palette == 1
    assert game.food != game.snake.head  # a fresh one was placed


def test_the_palette_cycles_and_wraps():
    game = new_game()
    game.start()
    for expected in range(1, PALETTE_COUNT + 2):
        game.food = game.snake.next_head()
        game.tick()
        assert game.palette == expected % PALETTE_COUNT


def test_running_into_a_wall_ends_the_game_without_moving():
    game = new_game(width=6, height=6)
    game.start()
    for _ in range(10):
        game.food = None
        game.tick()
    assert game.status is GameStatus.GAME_OVER
    # The snake stops at the edge rather than stepping off it.
    assert all(0 <= x < 6 and 0 <= y < 6 for x, y in game.snake.cells)


def test_food_never_lands_on_the_border():
    # `_respawn_food` samples the interior only, so an apple is never flush
    # against a wall - reaching one would mean steering into the wall behind it.
    game = new_game(width=12, height=8)
    for _ in range(50):
        game._respawn_food()
        assert game.food is not None
        x, y = game.food
        assert 0 < x < game.width - 1
        assert 0 < y < game.height - 1


def test_a_board_with_no_interior_has_nowhere_to_put_food():
    game = new_game(width=9, height=1)
    assert game.food is None


def test_filling_the_board_ends_the_game():
    # A 5x3 board has exactly three interior cells, all on the middle row, and
    # the snake already lies on two of them. One apple fills the last one.
    game = new_game(width=5, height=3)
    game.start()
    assert game.snake.cells == [(2, 1), (1, 1), (0, 1)]
    assert game.food == (3, 1)  # the only interior cell left

    game.tick()

    assert game.score == 1
    assert len(game.snake) == 4
    assert game.food is None
    assert game.status is GameStatus.GAME_OVER


def test_reset_puts_everything_back():
    game = new_game()
    game.start()
    game.food = game.snake.next_head()
    game.tick()
    game.tick()

    game.reset()

    assert game.status is GameStatus.READY
    assert game.score == 0
    assert game.ticks == 0
    assert len(game.snake) == 3
    assert game.food is not None


def test_reset_keeps_the_colours():
    # The one thing a reset does not undo. It is the same player carrying on,
    # so the screen stays on the pair it was wearing.
    game = new_game()
    game.start()
    for _ in range(2):
        game.food = game.snake.next_head()
        game.tick()
    assert game.palette == 2

    game.reset()

    assert game.palette == 2
    assert game.score == 0  # everything else did go back


def test_only_a_fresh_game_starts_from_the_first_pair():
    assert new_game().palette == 0


def test_resizing_also_keeps_the_colours():
    # `resize()` starts the run over through `reset()`, so it inherits the rule.
    game = new_game()
    game.start()
    game.food = game.snake.next_head()
    game.tick()

    game.resize(40, 20)

    assert game.palette == 1
    assert game.status is GameStatus.READY


def test_resize_reshapes_the_board_and_starts_over():
    game = new_game()
    game.start()
    game.tick()

    game.resize(56, 24)

    assert (game.width, game.height) == (56, 24)
    assert game.status is GameStatus.READY
    assert game.ticks == 0
    assert len(game.snake) == 3
    assert game.snake.head == (28, 12)


def test_resizing_to_the_size_it_already_is_leaves_the_run_alone():
    game = new_game()
    game.start()
    game.tick()

    game.resize(game.width, game.height)

    assert game.status is GameStatus.RUNNING
    assert game.ticks == 1


def test_a_hostile_board_size_is_clamped_not_honoured():
    game = new_game()
    game.resize(1, 100_000)
    assert (game.width, game.height) == (MIN_DIMENSION, MAX_DIMENSION)


def test_the_food_lands_inside_the_new_board():
    game = new_game()
    game.resize(60, 12)
    assert game.food is not None
    x, y = game.food
    assert 0 <= x < 60 and 0 <= y < 12
