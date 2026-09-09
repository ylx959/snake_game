/// Tests for the rules of the game.
///
/// Every case carries a tag, so a single group can be run in isolation:
///     ./core_tests "[snake]"          ./core_tests "[command]"
///     ctest --test-dir build -R Snake

#include <deque>
#include <string>
#include <vector>

#include <catch2/catch_test_macros.hpp>
#include <nlohmann/json.hpp>

#include "Collision.hpp"
#include "Command.hpp"
#include "Game.hpp"
#include "Snake.hpp"

using snake::Cell;
using snake::Command;
using snake::Direction;
using snake::Game;
using snake::GameStatus;
using snake::Snake;

namespace {

std::vector<Cell> cellsOf(const Snake& s) {
    return {s.cells().begin(), s.cells().end()};
}

}  // namespace

// --- Snake ---------------------------------------------------------------

TEST_CASE("Snake starts laid out behind its head", "[snake]") {
    const Snake s({5, 5});
    REQUIRE(cellsOf(s) == std::vector<Cell>{{5, 5}, {4, 5}, {3, 5}});
    REQUIRE(s.head() == Cell{5, 5});
}

TEST_CASE("Snake moves by advancing the head and dropping the tail", "[snake]") {
    Snake s({5, 5});
    s.move();
    REQUIRE(cellsOf(s) == std::vector<Cell>{{6, 5}, {5, 5}, {4, 5}});
}

TEST_CASE("Snake growth keeps the tail for exactly one tick", "[snake]") {
    Snake s({5, 5});
    s.grow();

    s.move();
    REQUIRE(cellsOf(s) == std::vector<Cell>{{6, 5}, {5, 5}, {4, 5}, {3, 5}});

    s.move();  // the growth is spent: back to dropping the tail
    REQUIRE(cellsOf(s) == std::vector<Cell>{{7, 5}, {6, 5}, {5, 5}, {4, 5}});
}

TEST_CASE("Snake ignores a reversal", "[snake]") {
    Snake s({5, 5}, Direction::Right);
    s.turn(Direction::Left);
    s.move();
    REQUIRE(s.head() == Cell{6, 5});
    REQUIRE(s.direction() == Direction::Right);
}

TEST_CASE("Two turns inside one tick cannot fold the snake onto its neck", "[snake]") {
    Snake s({5, 5}, Direction::Right);
    s.turn(Direction::Up);
    s.turn(Direction::Down);
    s.move();

    REQUIRE(s.head() != Cell{4, 5});   // the neck
    REQUIRE(s.head() == Cell{5, 6});   // the later legal turn wins
}

TEST_CASE("Snake::nextHead looks ahead without mutating", "[snake]") {
    Snake s({5, 5});
    REQUIRE(s.nextHead() == Cell{6, 5});
    REQUIRE(s.head() == Cell{5, 5});

    s.turn(Direction::Up);
    REQUIRE(s.nextHead() == Cell{5, 4});
}

TEST_CASE("Directions oppose and serialize by wire name", "[snake]") {
    REQUIRE(snake::isOpposite(Direction::Up, Direction::Down));
    REQUIRE(snake::isOpposite(Direction::Left, Direction::Right));
    REQUIRE_FALSE(snake::isOpposite(Direction::Up, Direction::Left));

    REQUIRE(snake::directionFromName("UP").has_value());
    REQUIRE_FALSE(snake::directionFromName("BOGUS").has_value());
    REQUIRE(snake::nameOf(Direction::Right) == "RIGHT");
}

// --- Collision -----------------------------------------------------------

TEST_CASE("Walls are fatal on every edge", "[collision]") {
    REQUIRE(snake::hitsWall({-1, 0}, 10, 10));
    REQUIRE(snake::hitsWall({0, -1}, 10, 10));
    REQUIRE(snake::hitsWall({10, 0}, 10, 10));
    REQUIRE(snake::hitsWall({0, 10}, 10, 10));

    REQUIRE_FALSE(snake::hitsWall({0, 0}, 10, 10));
    REQUIRE_FALSE(snake::hitsWall({9, 9}, 10, 10));
}

TEST_CASE("Following your own tail is legal", "[collision]") {
    const std::deque<Cell> body{{5, 5}, {4, 5}, {3, 5}};

    REQUIRE(snake::hitsSelf({4, 5}, body));          // the body is fatal
    REQUIRE_FALSE(snake::hitsSelf({3, 5}, body));    // the tail vacates this tick
    REQUIRE_FALSE(snake::hitsSelf({9, 9}, body));
}

TEST_CASE("isFatal covers both walls and the body", "[collision]") {
    const std::deque<Cell> body{{5, 5}, {4, 5}, {3, 5}};

    REQUIRE(snake::isFatal({-1, 5}, body, 10, 10));
    REQUIRE(snake::isFatal({4, 5}, body, 10, 10));
    REQUIRE_FALSE(snake::isFatal({6, 5}, body, 10, 10));
}

// --- Game ----------------------------------------------------------------

TEST_CASE("A new game is ready, not running", "[game]") {
    Game g(10, 10, 0.01, 1);
    REQUIRE(g.status() == GameStatus::Ready);

    const auto before = cellsOf(g.snake());
    g.tick();
    REQUIRE(cellsOf(g.snake()) == before);
    REQUIRE(g.ticks() == 0);
}

TEST_CASE("Start runs the clock", "[game]") {
    Game g(10, 10, 0.01, 1);
    g.start();
    g.tick();
    REQUIRE(g.status() == GameStatus::Running);
    REQUIRE(g.ticks() == 1);
}

TEST_CASE("Pause freezes the board and toggles back", "[game]") {
    Game g(10, 10, 0.01, 1);
    g.start();
    g.tick();
    g.pause();

    const auto frozen = cellsOf(g.snake());
    g.tick();
    REQUIRE(g.status() == GameStatus::Paused);
    REQUIRE(cellsOf(g.snake()) == frozen);

    g.togglePause();
    REQUIRE(g.status() == GameStatus::Running);
    g.togglePause();
    REQUIRE(g.status() == GameStatus::Paused);
}

TEST_CASE("The first turn starts the game", "[game]") {
    Game g(10, 10, 0.01, 1);
    g.turn(Direction::Up);
    REQUIRE(g.status() == GameStatus::Running);
}

TEST_CASE("A wall ends the game, and a dead game stays dead", "[game]") {
    Game g(10, 10, 0.01, 1);
    g.start();
    g.turn(Direction::Up);
    for (int i = 0; i < 20; ++i) g.tick();
    REQUIRE(g.status() == GameStatus::GameOver);

    const int ticks = g.ticks();
    g.tick();
    REQUIRE(g.ticks() == ticks);

    g.turn(Direction::Down);
    REQUIRE(g.status() == GameStatus::GameOver);

    g.reset();
    REQUIRE(g.status() == GameStatus::Ready);
    REQUIRE(g.score() == 0);
    REQUIRE(g.ticks() == 0);
    REQUIRE(g.snake().cells().size() == 3);
}

TEST_CASE("Eating scores and grows on the same tick", "[game]") {
    Game g(10, 10, 0.01, 1);
    g.start();
    g.setFood(g.snake().nextHead());
    const std::size_t length = g.snake().cells().size();

    g.tick();

    REQUIRE(g.score() == 1);
    REQUIRE(g.snake().cells().size() == length + 1);
    REQUIRE(g.food().has_value());
    REQUIRE(*g.food() != g.snake().head());   // respawned somewhere else
}

TEST_CASE("A seeded game is reproducible", "[game]") {
    const Game a(10, 10, 0.01, 7);
    const Game b(10, 10, 0.01, 7);
    REQUIRE(a.toJson() == b.toJson());
}

// --- The wire format -----------------------------------------------------

TEST_CASE("State serializes to the shape web/types/game.ts expects", "[wire]") {
    Game g(10, 10, 0.01, 1);
    const nlohmann::json state = nlohmann::json::parse(g.toJson());

    REQUIRE(state["type"] == "state");
    REQUIRE(state["width"] == 10);
    REQUIRE(state["height"] == 10);
    REQUIRE(state["status"] == "ready");
    REQUIRE(state["score"] == 0);
    REQUIRE(state["ticks"] == 0);
    REQUIRE(state["direction"] == "RIGHT");

    REQUIRE(state["snake"].is_array());
    REQUIRE(state["snake"].size() == 3);
    for (const auto& cell : state["snake"]) {
        REQUIRE(cell.is_array());
        REQUIRE(cell.size() == 2);
        REQUIRE(cell[0].is_number_integer());
    }

    REQUIRE(state["food"].is_array());
    REQUIRE(state["food"].size() == 2);
}

TEST_CASE("Absent food serializes as null", "[wire]") {
    Game g(10, 10, 0.01, 1);
    g.setFood(std::nullopt);
    REQUIRE(nlohmann::json::parse(g.toJson())["food"].is_null());
}

// --- Commands ------------------------------------------------------------

TEST_CASE("Every client message parses", "[command]") {
    const auto turn = snake::parseCommand(R"({"type":"turn","direction":"UP"})");
    REQUIRE(turn.has_value());
    REQUIRE(turn->kind == Command::Kind::Turn);
    REQUIRE(turn->direction == Direction::Up);

    REQUIRE(snake::parseCommand(R"({"type":"start"})")->kind == Command::Kind::Start);
    REQUIRE(snake::parseCommand(R"({"type":"pause"})")->kind == Command::Kind::Pause);
    REQUIRE(snake::parseCommand(R"({"type":"reset"})")->kind == Command::Kind::Reset);

    for (const char* name : {"UP", "DOWN", "LEFT", "RIGHT"}) {
        const std::string json =
            std::string(R"({"type":"turn","direction":")") + name + "\"}";
        REQUIRE(snake::parseCommand(json).has_value());
    }
}

TEST_CASE("Malformed and hostile messages are rejected, never thrown", "[command]") {
    const char* rejected[] = {
        "",
        "not json at all",
        "{}",
        "[]",                                       // an array, not an object
        "null",
        R"({"type":"fly"})",                        // unknown command
        R"({"type":"turn"})",                       // no direction
        R"({"type":"turn","direction":"BOGUS"})",
        R"({"type":"turn","direction":"up"})",      // wire names are upper case
        R"({"type":"turn","direction":7})",         // wrong JSON type
        R"({"type":7})",
        R"({"type":)",                              // truncated
        R"({"direction":"UP"})",                    // no type
    };

    for (const char* json : rejected) {
        INFO("input: " << json);
        REQUIRE_NOTHROW(snake::parseCommand(json));
        REQUIRE_FALSE(snake::parseCommand(json).has_value());
    }
}

TEST_CASE("Field order and extra fields do not matter", "[command]") {
    const auto c = snake::parseCommand(R"({"direction":"LEFT","type":"turn","pad":"x"})");
    REQUIRE(c.has_value());
    REQUIRE(c->kind == Command::Kind::Turn);
    REQUIRE(c->direction == Direction::Left);
}

TEST_CASE("Escapes and nesting parse correctly", "[command]") {
    // A hand-rolled extractor gets these wrong; a real parser does not.
    REQUIRE_FALSE(snake::parseCommand(R"({"note":"\"type\":\"reset\"","type":"fly"})").has_value());

    const auto nested = snake::parseCommand(R"({"meta":{"type":"reset"},"type":"start"})");
    REQUIRE(nested.has_value());
    REQUIRE(nested->kind == Command::Kind::Start);
}

TEST_CASE("apply drives the game through the server's own path", "[command]") {
    Game g(10, 10, 0.01, 1);

    snake::apply(*snake::parseCommand(R"({"type":"start"})"), g);
    REQUIRE(g.status() == GameStatus::Running);

    snake::apply(*snake::parseCommand(R"({"type":"pause"})"), g);
    REQUIRE(g.status() == GameStatus::Paused);

    snake::apply(*snake::parseCommand(R"({"type":"pause"})"), g);
    REQUIRE(g.status() == GameStatus::Running);

    snake::apply(*snake::parseCommand(R"({"type":"turn","direction":"UP"})"), g);
    g.tick();
    REQUIRE(g.snake().direction() == Direction::Up);

    snake::apply(*snake::parseCommand(R"({"type":"reset"})"), g);
    REQUIRE(g.status() == GameStatus::Ready);
    REQUIRE(g.ticks() == 0);
}
