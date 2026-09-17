/**
 * Which corners of a snake cell are rounded.
 *
 * The snake is drawn as hard squares - that is the pixel grid the whole board
 * is built on - with two exceptions: the leading edge of the **head** and the
 * trailing edge of the **tail**. Those two ends are the only places a snake
 * stops, so they are the only places a corner is not shared with another
 * segment. Rounding anything else would put a notch in the middle of a body
 * that is meant to read as one continuous run.
 *
 * Only *two* corners round at each end, never four. A head with four round
 * corners pulls away from its own neck: the two corners it shares with the
 * segment behind it have to stay square, or a pinch of background shows through
 * the join every tick.
 *
 * Framework-free like the rest of `lib/`, and used by both things that draw the
 * snake's silhouette - `Renderer` paints it on the canvas and `LitText` masks
 * the white readouts with it. They must agree to the pixel, so the rule lives
 * here rather than in either of them.
 */

import type { Cell, Direction } from "@/types/game";

/**
 * The corner radius, as a fraction of the cell's shorter side.
 *
 * Turn this one number up for a softer nose. Both consumers round it to whole
 * pixels from the same cell size, so on a small board it lands on 0 and the
 * ends go square on their own - which is what you want: a 2px radius on an 8px
 * cell is not a rounded corner, it is a chewed one.
 */
export const END_RADIUS = 0.15;

/**
 * One cell's four corners, in the order `roundRect` and CSS both use:
 * top-left, top-right, bottom-right, bottom-left.
 */
export type Corners = readonly [boolean, boolean, boolean, boolean];

export const SQUARE: Corners = [false, false, false, false];
const ALL: Corners = [true, true, true, true];

/**
 * The two corners on the far side of a cell, looking along `heading`.
 *
 * For a head that is the leading edge - the face nothing is in front of. For a
 * tail it is the same function read backwards: the tail's heading points *away*
 * from the body, so its far side is the end of the snake.
 */
const FAR_SIDE: Record<Direction, Corners> = {
  UP: [true, true, false, false],
  DOWN: [false, false, true, true],
  LEFT: [true, false, false, true],
  RIGHT: [false, true, true, false],
};

/**
 * Which way you are travelling going from one cell to the next one along.
 *
 * `null` when there is nothing to measure - the same cell twice, or a missing
 * one. The body is a contiguous run, so in practice the two always differ on
 * exactly one axis by exactly one.
 */
export function headingFrom(from: Cell | null, to: Cell | null): Direction | null {
  if (from === null || to === null) return null;
  const [x, y] = to;
  const [px, py] = from;
  if (x !== px) return x > px ? "RIGHT" : "LEFT";
  if (y !== py) return y > py ? "DOWN" : "UP";
  return null;
}

/**
 * The two ends of one snake: where they are, and what is behind the tail.
 *
 * Both cells are nullable because a shared board culls what is too far away to
 * see (`lib/vision.ts`). A culled end is simply absent, and then *nothing*
 * rounds - which is right: the cut where the fog stops is not the snake's end,
 * and giving it a nose would say an opponent finishes where it does not.
 *
 * `beforeTail` is the cell one in from the tail, and it is a *cell* rather than
 * a heading on purpose. It lets `lib/vision.ts` fill this in with nothing but
 * array indexing: the fog reports where things are and this file decides what
 * that means for a corner, which is the same split the two already have over
 * existence and brightness. It also keeps `vision.ts` free of value imports,
 * which is what lets `node --test` load it without tsconfig's `@/` alias.
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
 * The corners to round on one cell.
 *
 * A one-cell snake is its own head and tail - it has no neighbour to keep a
 * corner square for - so it rounds all four and reads as the pill it is.
 */
export function cornersOf(cell: Cell, snake: SnakeEnds): Corners {
  const isHead = snake.head !== null && same(cell, snake.head);
  const isTail = snake.tail !== null && same(cell, snake.tail);

  if (isHead && isTail) return ALL;
  if (isHead) return FAR_SIDE[snake.direction];

  if (isTail) {
    // Away from the body, not along it: the tail's free face is the one the
    // segment in front of it is not touching.
    const heading = headingFrom(snake.beforeTail, snake.tail);
    if (heading !== null) return FAR_SIDE[heading];
  }

  return SQUARE;
}

/** The radius in whole pixels for a cell of this size, 0 when it is too small. */
export function endRadius(width: number, height: number): number {
  return Math.round(Math.min(width, height) * END_RADIUS);
}
