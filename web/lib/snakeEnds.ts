/**
 * Which corners of a snake cell are rounded: the head's leading edge and the
 * tail's trailing edge, two corners each, and nothing else. Both the canvas and
 * LitText's mask read it from here, so they cannot disagree by a pixel.
 */

import type { Cell, Direction } from "@/types/game";

/**
 * The corner radius, as a fraction of the cell's shorter side. Turn this one
 * number up for a softer nose; both consumers round it to whole pixels, so a
 * small board lands on 0 and goes square on its own.
 */
export const END_RADIUS = 0.15;

/** One cell's corners, in the order `roundRect` and CSS use: tl, tr, br, bl. */
export type Corners = readonly [boolean, boolean, boolean, boolean];

export const SQUARE: Corners = [false, false, false, false];
const ALL: Corners = [true, true, true, true];

/** The two corners on the far side of a cell, looking along `heading`. */
const FAR_SIDE: Record<Direction, Corners> = {
  UP: [true, true, false, false],
  DOWN: [false, false, true, true],
  LEFT: [true, false, false, true],
  RIGHT: [false, true, true, false],
};

/** Which way you travel going from one cell to the next. */
export function headingFrom(from: Cell | null, to: Cell | null): Direction | null {
  if (from === null || to === null) return null;
  const [x, y] = to;
  const [px, py] = from;
  if (x !== px) return x > px ? "RIGHT" : "LEFT";
  if (y !== py) return y > py ? "DOWN" : "UP";
  return null;
}

/**
 * One snake's two ends, nullable because the fog culls what is too far to see
 * and its cut must round nothing. `beforeTail` is a cell, not a heading, so
 * `lib/vision.ts` fills it in by indexing and stays free of value imports.
 */
export interface SnakeEnds {
  head: Cell | null;
  direction: Direction;
  tail: Cell | null;
  beforeTail: Cell | null;
}

/** The ends of a whole, unfogged snake - solo's case. */
export function ends(cells: readonly Cell[], direction: Direction): SnakeEnds {
  return {
    head: cells[0] ?? null,
    direction,
    tail: cells.length > 0 ? cells[cells.length - 1] : null,
    beforeTail: cells.length > 1 ? cells[cells.length - 2] : null,
  };
}

const same = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];

/**
 * The corners to round on one cell. Never four at an end: the corners shared
 * with the next segment stay hard, or a pinch of background shows through the
 * join. A one-cell snake has no neighbour to keep one for, so it rounds fully.
 */
export function cornersOf(cell: Cell, snake: SnakeEnds): Corners {
  const isHead = snake.head !== null && same(cell, snake.head);
  const isTail = snake.tail !== null && same(cell, snake.tail);

  if (isHead && isTail) return ALL;
  if (isHead) return FAR_SIDE[snake.direction];

  if (isTail) {
    // Away from the body: the face the segment in front is not touching.
    const heading = headingFrom(snake.beforeTail, snake.tail);
    if (heading !== null) return FAR_SIDE[heading];
  }

  return SQUARE;
}

/** The radius in whole pixels, 0 when the cell is too small to bother. */
export function endRadius(width: number, height: number): number {
  return Math.round(Math.min(width, height) * END_RADIUS);
}
