import pytest

from game.collision import hits_self, hits_wall, is_fatal
from game.snake import Direction, Snake

pytestmark = pytest.mark.collision


@pytest.mark.parametrize("cell", [(-1, 4), (4, -1), (10, 4), (4, 10)])
def test_cells_off_the_board_hit_the_wall(cell):
    assert hits_wall(cell, 10, 10)


@pytest.mark.parametrize("cell", [(0, 0), (9, 9), (5, 5)])
def test_cells_on_the_board_do_not(cell):
    assert not hits_wall(cell, 10, 10)


def test_an_empty_body_hits_nothing():
    assert not hits_self((0, 0), [])


def test_the_last_cell_is_not_a_collision():
    # The tail vacates on the tick the head arrives, so following your own tail
    # is legal. This is the whole reason the check excludes the last element.
    body = [(5, 5), (4, 5), (3, 5)]
    assert not hits_self((3, 5), body)


def test_any_other_body_cell_is_a_collision():
    body = [(5, 5), (4, 5), (3, 5)]
    assert hits_self((4, 5), body)


def test_a_coiled_snake_may_move_onto_the_cell_its_tail_is_leaving():
    # Drive a length-4 snake around a 2x2 loop so `next_head()` lands exactly on
    # the tail cell.
    snake = Snake((4, 6), Direction.RIGHT, length=4)
    for direction in (Direction.UP, Direction.RIGHT, Direction.DOWN):
        snake.turn(direction)
        snake.move()
    assert snake.cells == [(5, 6), (5, 5), (4, 5), (4, 6)]

    snake.turn(Direction.LEFT)
    assert snake.next_head() == snake.cells[-1]
    assert not is_fatal(snake.next_head(), snake.cells, 24, 24)


def test_the_same_loop_kills_a_snake_one_segment_longer():
    # One extra segment means the target cell is no longer the tail, so it does
    # not vacate in time.
    snake = Snake((4, 6), Direction.RIGHT, length=5)
    for direction in (Direction.UP, Direction.RIGHT, Direction.DOWN):
        snake.turn(direction)
        snake.move()
    snake.turn(Direction.LEFT)
    assert is_fatal(snake.next_head(), snake.cells, 24, 24)


def test_is_fatal_covers_both_walls_and_the_body():
    body = [(0, 0), (1, 0), (2, 0)]
    assert is_fatal((-1, 0), body, 10, 10)
    assert is_fatal((1, 0), body, 10, 10)
    assert not is_fatal((0, 1), body, 10, 10)
