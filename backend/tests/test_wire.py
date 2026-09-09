import json

import pytest

from game.game import Game, GameStatus
from game.snake import Direction

pytestmark = pytest.mark.wire

EXPECTED_KEYS = {
    "type",
    "width",
    "height",
    "status",
    "score",
    "ticks",
    "direction",
    "snake",
    "food",
    "palette",
}


def test_the_message_has_exactly_the_fields_the_browser_expects():
    # web/types/game.ts is the other half of this contract and nothing checks
    # that the two agree, so this test is the only guard against a field being
    # renamed or dropped here.
    assert set(Game(seed=1).to_dict()) == EXPECTED_KEYS


def test_it_is_tagged_as_a_state_message():
    assert Game(seed=1).to_dict()["type"] == "state"


def test_cells_serialize_as_two_element_arrays():
    payload = json.loads(json.dumps(Game(seed=1).to_dict()))
    assert all(isinstance(cell, list) and len(cell) == 2 for cell in payload["snake"])
    assert isinstance(payload["food"], list) and len(payload["food"]) == 2


def test_the_snake_is_serialized_head_first():
    game = Game(seed=1)
    assert game.to_dict()["snake"][0] == list(game.snake.head)


def test_absent_food_serializes_as_null():
    game = Game(seed=1)
    game.food = None
    assert json.loads(json.dumps(game.to_dict()))["food"] is None


@pytest.mark.parametrize(
    "status,name",
    [
        (GameStatus.READY, "ready"),
        (GameStatus.RUNNING, "running"),
        (GameStatus.PAUSED, "paused"),
        (GameStatus.GAME_OVER, "game_over"),
    ],
)
def test_status_uses_the_wire_spelling(status, name):
    game = Game(seed=1)
    game.status = status
    assert game.to_dict()["status"] == name


def test_direction_uses_the_wire_spelling():
    game = Game(seed=1)
    game.turn(Direction.UP)
    game.tick()
    assert game.to_dict()["direction"] == "UP"


def test_the_palette_is_an_index_not_a_colour():
    assert Game(seed=1).to_dict()["palette"] == 0
