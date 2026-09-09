import pytest

from game.snake import Direction, Snake, direction_from_name

pytestmark = pytest.mark.snake


def test_body_is_laid_out_behind_the_head():
    snake = Snake((5, 5), Direction.RIGHT, length=3)
    assert snake.cells == [(5, 5), (4, 5), (3, 5)]
    assert snake.head == (5, 5)


def test_move_advances_the_head_and_drops_the_tail():
    snake = Snake((5, 5), Direction.RIGHT, length=3)
    snake.move()
    assert snake.cells == [(6, 5), (5, 5), (4, 5)]
    assert len(snake) == 3


def test_growth_is_owed_and_paid_off_one_segment_per_move():
    snake = Snake((5, 5), Direction.RIGHT, length=3)
    snake.grow(2)
    snake.move()
    assert len(snake) == 4
    snake.move()
    assert len(snake) == 5
    snake.move()
    assert len(snake) == 5  # nothing owed any more


def test_growing_keeps_the_tail_in_place():
    snake = Snake((5, 5), Direction.RIGHT, length=3)
    snake.grow()
    snake.move()
    assert snake.cells == [(6, 5), (5, 5), (4, 5), (3, 5)]


def test_a_turn_is_not_visible_until_move_commits_it():
    snake = Snake((5, 5), Direction.RIGHT)
    snake.turn(Direction.UP)
    assert snake.direction is Direction.RIGHT
    snake.move()
    assert snake.direction is Direction.UP
    assert snake.head == (5, 4)


def test_reversing_is_ignored():
    snake = Snake((5, 5), Direction.RIGHT)
    snake.turn(Direction.LEFT)
    snake.move()
    assert snake.direction is Direction.RIGHT
    assert snake.head == (6, 5)


def test_two_turns_in_one_tick_cannot_fold_the_snake_onto_its_neck():
    # The load-bearing case. UP is legal from RIGHT, and LEFT is legal from UP,
    # so validating against the *buffered* heading would let both through and
    # send the head straight back down the body.
    snake = Snake((5, 5), Direction.RIGHT)
    snake.turn(Direction.UP)
    snake.turn(Direction.LEFT)
    snake.move()
    assert snake.direction is Direction.UP
    assert snake.head == (5, 4)


def test_next_head_honours_a_buffered_turn_without_moving():
    snake = Snake((5, 5), Direction.RIGHT)
    assert snake.next_head() == (6, 5)
    snake.turn(Direction.DOWN)
    assert snake.next_head() == (5, 6)
    assert snake.head == (5, 5)


def test_occupies_covers_the_whole_body():
    snake = Snake((5, 5), Direction.RIGHT, length=3)
    assert snake.occupies((4, 5))
    assert not snake.occupies((9, 9))


@pytest.mark.parametrize("name", ["UP", "DOWN", "LEFT", "RIGHT"])
def test_wire_names_round_trip(name):
    assert direction_from_name(name).name == name


@pytest.mark.parametrize("name", ["up", "NORTH", ""])
def test_unrecognised_wire_names_are_rejected(name):
    assert direction_from_name(name) is None
