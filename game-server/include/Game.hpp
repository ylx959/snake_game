#pragma once

/// The game itself: owns the board, drives the tick, and is the only thing
/// that decides what is true. The browser renders whatever this produces.

#include <cstdint>
#include <deque>
#include <optional>
#include <random>
#include <string>
#include <string_view>

#include "Snake.hpp"

namespace snake {

inline constexpr int kDefaultWidth = 24;
inline constexpr int kDefaultHeight = 24;
inline constexpr double kDefaultTickSeconds = 0.12;

enum class GameStatus { Ready, Running, Paused, GameOver };

std::string_view nameOf(GameStatus status);

/// A single game session. One per connected player.
///
/// `tick()` is the whole game in one call: advance the snake, resolve food,
/// resolve death. Everything else is setup or serialization.
class Game {
public:
    explicit Game(int width = kDefaultWidth,
                  int height = kDefaultHeight,
                  double tickSeconds = kDefaultTickSeconds,
                  std::optional<std::uint32_t> seed = std::nullopt);

    void reset();

    // --- commands from the player ---------------------------------------
    void start();
    void pause();
    /// Space is a single key, so pausing and resuming are the same command.
    void togglePause();
    /// A turn also starts the game, so the first arrow key just works.
    void turn(Direction direction);

    // --- the loop --------------------------------------------------------
    void tick();

    // --- what the browser sees -------------------------------------------
    /// The wire format. Keep in sync with web/types/game.ts.
    std::string toJson() const;

    double tickSeconds() const { return tickSeconds_; }
    GameStatus status() const { return status_; }
    int score() const { return score_; }
    int ticks() const { return ticks_; }
    const Snake& snake() const { return snake_; }
    const std::optional<Cell>& food() const { return food_; }

    /// Test seam: place food deterministically.
    void setFood(std::optional<Cell> food) { food_ = food; }

private:
    /// Place food on a free cell. False when the board is full.
    ///
    /// Samples from the *free* cells rather than retrying random guesses, so a
    /// nearly-full board still terminates.
    bool respawnFood();

    int width_;
    int height_;
    double tickSeconds_;
    std::mt19937 rng_;
    Snake snake_;
    std::optional<Cell> food_;
    int score_ = 0;
    int ticks_ = 0;
    GameStatus status_ = GameStatus::Ready;
};

}  // namespace snake
