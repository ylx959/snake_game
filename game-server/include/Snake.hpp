#pragma once

/// Snake body state: where it is, which way it's going, how it grows.

#include <deque>
#include <optional>
#include <string>
#include <string_view>

namespace snake {

/// A grid coordinate. `y` grows downwards, matching the canvas.
struct Cell {
    int x{};
    int y{};

    friend bool operator==(const Cell&, const Cell&) = default;
};

enum class Direction { Up, Down, Left, Right };

/// The (dx, dy) step for a heading.
Cell vectorOf(Direction direction);

bool isOpposite(Direction a, Direction b);

/// Wire name, e.g. "UP". Returns nullopt for anything unrecognised, so a
/// malformed client message is ignored rather than fatal.
std::optional<Direction> directionFromName(std::string_view name);
std::string_view nameOf(Direction direction);

/// The snake itself.
///
/// The body is ordered head-first. A turn requested mid-tick is buffered in
/// `pending_` and only applied on `move()`, so two key presses inside one tick
/// can never fold the snake back onto its own neck.
class Snake {
public:
    explicit Snake(Cell start, Direction direction = Direction::Right, int length = 3);

    const Cell& head() const { return body_.front(); }
    const std::deque<Cell>& cells() const { return body_; }
    Direction direction() const { return direction_; }

    /// Queue a direction change. A 180-degree reversal is ignored.
    void turn(Direction direction);

    void grow(int amount = 1);

    /// Where the head lands next tick, without moving anything.
    Cell nextHead() const;

    /// Advance one tick: commit the pending turn, push a new head, drop the
    /// tail unless there is growth owed.
    void move();

private:
    std::deque<Cell> body_;
    Direction direction_;
    Direction pending_;
    int grow_ = 0;
};

}  // namespace snake
