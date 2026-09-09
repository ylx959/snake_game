#include "Collision.hpp"

#include <algorithm>

namespace snake {

bool hitsWall(Cell cell, int width, int height) {
    return cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height;
}

bool hitsSelf(Cell cell, const std::deque<Cell>& body) {
    if (body.empty()) return false;
    return std::find(body.begin(), std::prev(body.end()), cell) != std::prev(body.end());
}

bool isFatal(Cell cell, const std::deque<Cell>& body, int width, int height) {
    return hitsWall(cell, width, height) || hitsSelf(cell, body);
}

}  // namespace snake
