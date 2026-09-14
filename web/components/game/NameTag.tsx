"use client";

/**
 * A small label riding above your own snake's head.
 *
 * It replaces the white ring the head used to wear. A ring says "this one is
 * yours" only if you already knew to look for it; a name says it outright, and
 * it is the same answer the roster in the corner gives, so the two agree.
 *
 * It is DOM, not canvas, for the same reason every other piece of text here is:
 * the renderer draws the board and never calls `fillText`, so the pixel font
 * stays a font.
 *
 * It positions itself in **percentages of the board** rather than by measuring
 * anything. `.ui` is `inset: 0` over `.stage`, so 0-100% across it *is* the
 * board, and the tag lands on the right cell at any window size without a
 * `ResizeObserver`, a `getBoundingClientRect`, or a second copy of the fit.
 */

import { playerColorAt } from "@/lib/palette";
import type { SnakeView } from "@/types/game";

/** How close to an edge before the tag flips to the other side of the head. */
const EDGE = 2;

/** Where the tag sits relative to the head. */
type Placement = "above" | "below" | "right" | "left";

/**
 * The side of the head that is not the snake's own body.
 *
 * "Above the head" is the obvious answer and it is wrong half the time: a snake
 * heading down has its body directly above its head, and the tag lands on it.
 * The body is always in line with the heading, so the clear side is always the
 * one across it - above a snake running left or right, beside one running up or
 * down. Then flip if that side is off the board.
 */
function placement(direction: string, x: number, y: number, cols: number): Placement {
  if (direction === "LEFT" || direction === "RIGHT") {
    return y <= EDGE ? "below" : "above";
  }
  return x >= cols - EDGE ? "left" : "right";
}

export function NameTag({
  snake,
  cols,
  rows,
}: {
  snake: SnakeView | null;
  cols: number;
  rows: number;
}) {
  // Nothing to label: not in this game, already out, or between rounds.
  if (!snake || !snake.alive || snake.cells.length === 0) return null;

  const [x, y] = snake.cells[0];
  const at = placement(snake.direction, x, y, cols);

  // The anchor is the edge of the head cell the tag hangs off; the rest of the
  // offset is a CSS transform, so it scales with the type rather than the board.
  const anchorX = at === "right" ? x + 1 : at === "left" ? x : x + 0.5;
  const anchorY = at === "below" ? y + 1 : at === "above" ? y : y + 0.5;

  return (
    <span
      className="nametag"
      data-at={at}
      style={{
        left: `${(anchorX / cols) * 100}%`,
        top: `${(anchorY / rows) * 100}%`,
        color: playerColorAt(snake.color),
      }}
      // The roster already names every player to assistive technology; this is
      // the same fact drawn on the board.
      aria-hidden="true"
    >
      {snake.nickname}
    </span>
  );
}
