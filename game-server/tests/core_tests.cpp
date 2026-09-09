/// Tests for the rules of the game. No framework: the assertions below are the
/// whole harness, so the suite builds anywhere the server does.

#include <cstdlib>
#include <deque>
#include <iostream>
#include <string>
#include <vector>

#include "Collision.hpp"
#include "Game.hpp"
#include "Snake.hpp"

namespace {

int failures = 0;
int checks = 0;

void check(bool condition, const std::string& what) {
    ++checks;
    if (!condition) {
        ++failures;
        std::cerr << "FAIL: " << what << "\n";
    }
}

std::vector<snake::Cell> cellsOf(const snake::Snake& s) {
    return {s.cells().begin(), s.cells().end()};
}

bool equal(const std::vector<snake::Cell>& got, const std::vector<snake::Cell>& want) {
    return got == want;
}

// --- Snake ---------------------------------------------------------------

void testSnake() {
    {
        snake::Snake s({5, 5});
        check(equal(cellsOf(s), {{5, 5}, {4, 5}, {3, 5}}), "starts horizontal, head first");
        check(s.head() == snake::Cell{5, 5}, "head is the front cell");
    }
    {
        snake::Snake s({5, 5});
        s.move();
        check(equal(cellsOf(s), {{6, 5}, {5, 5}, {4, 5}}), "move advances head and drops tail");
    }
    {
        snake::Snake s({5, 5});
        s.grow();
        s.move();
        check(equal(cellsOf(s), {{6, 5}, {5, 5}, {4, 5}, {3, 5}}), "growth keeps the tail one tick");
        s.move();
        check(equal(cellsOf(s), {{7, 5}, {6, 5}, {5, 5}, {4, 5}}), "growth is spent after one tick");
    }
    {
        snake::Snake s({5, 5}, snake::Direction::Right);
        s.turn(snake::Direction::Left);
        s.move();
        check(s.head() == snake::Cell{6, 5}, "reversal is ignored");
        check(s.direction() == snake::Direction::Right, "reversal leaves the heading alone");
    }
    {
        // UP then DOWN before a tick must not double back onto the neck.
        snake::Snake s({5, 5}, snake::Direction::Right);
        s.turn(snake::Direction::Up);
        s.turn(snake::Direction::Down);
        s.move();
        check(s.head() != snake::Cell{4, 5}, "two turns in one tick cannot fold the snake");
        check(s.head() == snake::Cell{5, 6}, "the later legal turn wins");
    }
    {
        snake::Snake s({5, 5});
        check(s.nextHead() == snake::Cell{6, 5}, "nextHead looks ahead");
        check(s.head() == snake::Cell{5, 5}, "nextHead does not mutate");
        s.turn(snake::Direction::Up);
        check(s.nextHead() == snake::Cell{5, 4}, "nextHead uses the pending turn");
    }
    {
        check(snake::isOpposite(snake::Direction::Up, snake::Direction::Down), "up/down oppose");
        check(snake::isOpposite(snake::Direction::Left, snake::Direction::Right), "left/right oppose");
        check(!snake::isOpposite(snake::Direction::Up, snake::Direction::Left), "up/left do not oppose");
        check(snake::directionFromName("UP").has_value(), "UP parses");
        check(!snake::directionFromName("BOGUS").has_value(), "an unknown direction is rejected");
        check(snake::nameOf(snake::Direction::Right) == "RIGHT", "direction serializes to the wire name");
    }
}

// --- Collision -----------------------------------------------------------

void testCollision() {
    const std::deque<snake::Cell> body{{5, 5}, {4, 5}, {3, 5}};

    check(snake::hitsWall({-1, 0}, 10, 10), "left wall");
    check(snake::hitsWall({0, -1}, 10, 10), "top wall");
    check(snake::hitsWall({10, 0}, 10, 10), "right wall");
    check(snake::hitsWall({0, 10}, 10, 10), "bottom wall");
    check(!snake::hitsWall({0, 0}, 10, 10), "top-left corner is inside");
    check(!snake::hitsWall({9, 9}, 10, 10), "bottom-right corner is inside");

    check(snake::hitsSelf({4, 5}, body), "running into the body is fatal");
    check(!snake::hitsSelf({3, 5}, body), "following your own tail is legal");
    check(!snake::hitsSelf({9, 9}, body), "empty space is not the body");

    check(snake::isFatal({-1, 5}, body, 10, 10), "isFatal covers walls");
    check(snake::isFatal({4, 5}, body, 10, 10), "isFatal covers the body");
    check(!snake::isFatal({6, 5}, body, 10, 10), "open ground is survivable");
}

// --- Game ----------------------------------------------------------------

void testGame() {
    {
        snake::Game g(10, 10, 0.01, 1);
        check(g.status() == snake::GameStatus::Ready, "a new game is ready, not running");
        const auto before = cellsOf(g.snake());
        g.tick();
        check(equal(cellsOf(g.snake()), before), "a ready game does not move");
        check(g.ticks() == 0, "a ready game does not count ticks");
    }
    {
        snake::Game g(10, 10, 0.01, 1);
        g.start();
        g.tick();
        check(g.status() == snake::GameStatus::Running, "start runs the game");
        check(g.ticks() == 1, "a running game counts ticks");
    }
    {
        snake::Game g(10, 10, 0.01, 1);
        g.start();
        g.tick();
        g.pause();
        const auto frozen = cellsOf(g.snake());
        g.tick();
        check(g.status() == snake::GameStatus::Paused, "pause holds");
        check(equal(cellsOf(g.snake()), frozen), "a paused board is frozen");
        g.togglePause();
        check(g.status() == snake::GameStatus::Running, "toggle resumes from paused");
        g.togglePause();
        check(g.status() == snake::GameStatus::Paused, "toggle pauses from running");
    }
    {
        snake::Game g(10, 10, 0.01, 1);
        g.turn(snake::Direction::Up);
        check(g.status() == snake::GameStatus::Running, "the first turn starts the game");
    }
    {
        snake::Game g(10, 10, 0.01, 1);
        g.start();
        g.turn(snake::Direction::Up);
        for (int i = 0; i < 20; ++i) g.tick();
        check(g.status() == snake::GameStatus::GameOver, "running into a wall ends the game");

        const int ticks = g.ticks();
        g.tick();
        check(g.ticks() == ticks, "a dead game stops ticking");

        g.turn(snake::Direction::Down);
        check(g.status() == snake::GameStatus::GameOver, "a dead game ignores turns");

        g.reset();
        check(g.status() == snake::GameStatus::Ready, "reset revives a dead game");
        check(g.score() == 0 && g.ticks() == 0, "reset clears the score and the clock");
        check(g.snake().cells().size() == 3, "reset restores the starting length");
    }
    {
        snake::Game g(10, 10, 0.01, 1);
        g.start();
        g.setFood(g.snake().nextHead());
        const std::size_t length = g.snake().cells().size();
        g.tick();
        check(g.score() == 1, "eating scores");
        check(g.snake().cells().size() == length + 1, "eating grows on the same tick");
        check(g.food().has_value() && *g.food() != g.snake().head(), "food respawns elsewhere");
    }
    {
        // A 2x1 board with a one-cell snake: eating the last free cell fills it.
        snake::Game g(2, 1, 0.01, 1);
        g.start();
        check(g.status() == snake::GameStatus::Running, "the tiny board starts");
        g.setFood(snake::Cell{1, 0});
        g.tick();
        check(g.score() >= 0, "the tiny board ticks without crashing");
    }
    {
        snake::Game g(10, 10, 0.01, 1);
        const std::string json = g.toJson();
        check(json.find(R"("type":"state")") != std::string::npos, "the wire message is tagged");
        for (const char* field : {"width", "height", "status", "score", "ticks", "snake",
                                  "direction", "food"}) {
            check(json.find(std::string("\"") + field + "\":") != std::string::npos,
                  std::string("the wire format carries ") + field);
        }
        check(json.find(R"("status":"ready")") != std::string::npos, "status serializes by name");
        check(json.find(R"("direction":"RIGHT")") != std::string::npos, "direction serializes by name");

        g.setFood(std::nullopt);
        check(g.toJson().find(R"("food":null)") != std::string::npos, "absent food serializes as null");
    }
    {
        // Same seed, same board: sessions are reproducible for debugging.
        snake::Game a(10, 10, 0.01, 7);
        snake::Game b(10, 10, 0.01, 7);
        check(a.toJson() == b.toJson(), "a seeded game is deterministic");
    }
}

}  // namespace

int main() {
    testSnake();
    testCollision();
    testGame();

    std::cout << checks - failures << "/" << checks << " checks passed\n";
    if (failures > 0) {
        std::cerr << failures << " check(s) failed\n";
        return 1;
    }
    return 0;
}
