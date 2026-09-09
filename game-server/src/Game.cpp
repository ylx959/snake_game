#include "Game.hpp"

#include <algorithm>
#include <random>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "Collision.hpp"

namespace snake {

std::string_view nameOf(GameStatus status) {
    switch (status) {
        case GameStatus::Ready:    return "ready";
        case GameStatus::Running:  return "running";
        case GameStatus::Paused:   return "paused";
        case GameStatus::GameOver: return "game_over";
    }
    return "ready";
}

Game::Game(int width, int height, double tickSeconds, std::optional<std::uint32_t> seed)
    : width_(width),
      height_(height),
      tickSeconds_(tickSeconds),
      rng_(seed ? *seed : std::random_device{}()),
      snake_(Cell{width / 2, height / 2}) {
    reset();
}

void Game::reset() {
    snake_ = Snake(Cell{width_ / 2, height_ / 2}, Direction::Right);
    food_.reset();
    respawnFood();
    score_ = 0;
    ticks_ = 0;
    status_ = GameStatus::Ready;
}

void Game::start() {
    if (status_ == GameStatus::Ready || status_ == GameStatus::Paused) {
        status_ = GameStatus::Running;
    }
}

void Game::pause() {
    if (status_ == GameStatus::Running) status_ = GameStatus::Paused;
}

void Game::togglePause() {
    if (status_ == GameStatus::Paused) {
        status_ = GameStatus::Running;
    } else {
        pause();
    }
}

void Game::turn(Direction direction) {
    if (status_ == GameStatus::Ready) status_ = GameStatus::Running;
    if (status_ == GameStatus::Running) snake_.turn(direction);
}

void Game::tick() {
    if (status_ != GameStatus::Running) return;

    const Cell target = snake_.nextHead();
    if (isFatal(target, snake_.cells(), width_, height_)) {
        status_ = GameStatus::GameOver;
        return;
    }

    // Resolve food *before* moving, so growth and score land on the same tick.
    // Growing first also keeps the tail in place, which is what makes the new
    // segment appear immediately rather than one tick late.
    const bool eating = food_.has_value() && *food_ == target;
    if (eating) snake_.grow();

    snake_.move();
    ++ticks_;

    if (eating) {
        ++score_;
        if (!respawnFood()) {
            status_ = GameStatus::GameOver;  // board full: the snake won
        }
    }
}

bool Game::respawnFood() {
    const std::deque<Cell>& body = snake_.cells();

    std::vector<Cell> free;
    free.reserve(static_cast<std::size_t>(width_) * height_);
    for (int y = 0; y < height_; ++y) {
        for (int x = 0; x < width_; ++x) {
            const Cell cell{x, y};
            if (std::find(body.begin(), body.end(), cell) == body.end()) {
                free.push_back(cell);
            }
        }
    }

    if (free.empty()) {
        food_.reset();
        return false;
    }

    std::uniform_int_distribution<std::size_t> pick(0, free.size() - 1);
    food_ = free[pick(rng_)];
    return true;
}

std::string Game::toJson() const {
    nlohmann::json out{
        {"type", "state"},
        {"width", width_},
        {"height", height_},
        {"status", nameOf(status_)},
        {"score", score_},
        {"ticks", ticks_},
        {"direction", nameOf(snake_.direction())},
    };

    nlohmann::json body = nlohmann::json::array();
    for (const Cell& cell : snake_.cells()) {
        body.push_back({cell.x, cell.y});
    }
    out["snake"] = std::move(body);

    if (food_) {
        out["food"] = {food_->x, food_->y};
    } else {
        out["food"] = nullptr;
    }

    return out.dump();
}

}  // namespace snake
