#include "Snake.hpp"

namespace snake {

Cell vectorOf(Direction direction) {
    switch (direction) {
        case Direction::Up:    return {0, -1};
        case Direction::Down:  return {0, 1};
        case Direction::Left:  return {-1, 0};
        case Direction::Right: return {1, 0};
    }
    return {0, 0};
}

bool isOpposite(Direction a, Direction b) {
    const Cell va = vectorOf(a);
    const Cell vb = vectorOf(b);
    return va.x == -vb.x && va.y == -vb.y;
}

std::optional<Direction> directionFromName(std::string_view name) {
    if (name == "UP") return Direction::Up;
    if (name == "DOWN") return Direction::Down;
    if (name == "LEFT") return Direction::Left;
    if (name == "RIGHT") return Direction::Right;
    return std::nullopt;
}

std::string_view nameOf(Direction direction) {
    switch (direction) {
        case Direction::Up:    return "UP";
        case Direction::Down:  return "DOWN";
        case Direction::Left:  return "LEFT";
        case Direction::Right: return "RIGHT";
    }
    return "RIGHT";
}

Snake::Snake(Cell start, Direction direction, int length)
    : direction_(direction), pending_(direction) {
    // Lay the body out behind the head along -x, mirroring the starting heading
    // of Right so the snake begins fully on the board.
    for (int i = 0; i < length; ++i) {
        body_.push_back({start.x - i, start.y});
    }
}

void Snake::turn(Direction direction) {
    if (isOpposite(direction, direction_)) return;
    pending_ = direction;
}

void Snake::grow(int amount) { grow_ += amount; }

Cell Snake::nextHead() const {
    const Cell step = vectorOf(pending_);
    const Cell h = head();
    return {h.x + step.x, h.y + step.y};
}

void Snake::move() {
    direction_ = pending_;
    body_.push_front(nextHead());
    if (grow_ > 0) {
        --grow_;
    } else {
        body_.pop_back();
    }
}

}  // namespace snake
