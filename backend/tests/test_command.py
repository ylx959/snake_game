import pytest

from game.command import Pause, Reset, Resize, Start, Turn, apply, parse_command
from game.game import Game, GameStatus
from game.snake import Direction

pytestmark = pytest.mark.command


def test_a_turn_carries_its_direction():
    assert parse_command('{"type":"turn","direction":"LEFT"}') == Turn(Direction.LEFT)


@pytest.mark.parametrize(
    "text,expected",
    [
        ('{"type":"start"}', Start()),
        ('{"type":"pause"}', Pause()),
        ('{"type":"reset"}', Reset()),
    ],
)
def test_the_bare_commands_parse(text, expected):
    assert parse_command(text) == expected


def test_a_resize_carries_both_dimensions():
    assert parse_command('{"type":"resize","width":56,"height":24}') == Resize(56, 24)


@pytest.mark.parametrize(
    "text",
    [
        "",
        "not json",
        "{",
        "[]",  # an array is not a command
        "42",
        '{"type":"fly"}',
        "{}",  # no type at all
        '{"type":42}',
        '{"type":"turn"}',  # no direction
        '{"type":"turn","direction":"NORTH"}',
        '{"type":"turn","direction":7}',
        '{"type":"resize","width":56}',  # only half a board
        '{"type":"resize","width":"56","height":24}',
        '{"type":"resize","width":56.5,"height":24}',
        # `bool` is an `int` in Python, so this one needs its own guard.
        '{"type":"resize","width":true,"height":24}',
    ],
)
def test_malformed_text_is_rejected_rather_than_raising(text):
    # Input arrives straight off a socket, so garbage is an expected case.
    assert parse_command(text) is None


def test_apply_start_runs_the_game():
    game = Game(seed=1)
    apply(Start(), game)
    assert game.status is GameStatus.RUNNING


def test_apply_pause_toggles_because_space_is_one_key():
    game = Game(seed=1)
    apply(Start(), game)
    apply(Pause(), game)
    assert game.status is GameStatus.PAUSED
    apply(Pause(), game)
    assert game.status is GameStatus.RUNNING


def test_apply_reset_puts_the_game_back_to_ready():
    game = Game(seed=1)
    apply(Start(), game)
    game.tick()
    apply(Reset(), game)
    assert game.status is GameStatus.READY
    assert game.ticks == 0


def test_apply_turn_reaches_the_snake():
    game = Game(seed=1)
    apply(Turn(Direction.UP), game)
    game.tick()
    assert game.snake.direction is Direction.UP


def test_apply_resize_reaches_the_board():
    game = Game(seed=1)
    apply(Resize(56, 24), game)
    assert (game.width, game.height) == (56, 24)
