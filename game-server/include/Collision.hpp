#pragma once

/// Collision predicates. Pure functions over cells - no game state held here.

#include <deque>

#include "Snake.hpp"

namespace snake {

bool hitsWall(Cell cell, int width, int height);

/// True if `cell` lands on the snake's own body.
///
/// The tail cell is excluded because it vacates on the same tick the head
/// arrives - following your own tail is legal.
bool hitsSelf(Cell cell, const std::deque<Cell>& body);

bool isFatal(Cell cell, const std::deque<Cell>& body, int width, int height);

}  // namespace snake
