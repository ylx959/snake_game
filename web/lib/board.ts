/**
 * Board geometry: where the board sits on screen, and where one cell lands
 * inside it.
 *
 * The board has a fixed shape - the server's `width` x `height` - so the window
 * cannot change it. Resizing the window only changes how *big* the board is
 * drawn; the snake, the apple and every cell scale with it by exactly the same
 * factor. Nothing here is game state; it is measurement.
 */

export interface BoardRect {
  /** Offset from the window's top-left, in CSS pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** One cell, square, in whole CSS pixels. */
  cell: number;
}

/** Corner radius shared by the painted snake and its DOM text mask. */
export const SNAKE_CELL_RADIUS_RATIO = 0.15;

/** A subtle radius based on the shorter side of a rendered snake cell. */
export function snakeCellRadius(width: number, height: number): number {
  return Math.min(width, height) * SNAKE_CELL_RADIUS_RATIO;
}

/** An SVG path whose circular corners match Canvas 2D's `roundRect`. */
export function roundedRectPath(
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
): string {
  const right = left + width;
  const bottom = top + height;

  return [
    `M${left + radius} ${top}`,
    `H${right - radius}A${radius} ${radius} 0 0 1 ${right} ${top + radius}`,
    `V${bottom - radius}A${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `H${left + radius}A${radius} ${radius} 0 0 1 ${left} ${bottom - radius}`,
    `V${top + radius}A${radius} ${radius} 0 0 1 ${left + radius} ${top}Z`,
  ].join("");
}

/**
 * The largest board of the given shape that fits the window, centred.
 *
 * The cell size is floored to a whole pixel, which is what keeps every cell
 * exactly square and every edge on a pixel boundary at any window size - the
 * remainder becomes the margin around the board rather than a fraction smeared
 * across the cells. Both sides are the same multiple of the cell, so the
 * board's aspect ratio is `cols:rows` exactly, whatever shape the window is.
 */
export function fitBoard(
  viewWidth: number,
  viewHeight: number,
  cols: number,
  rows: number,
): BoardRect {
  const cell = Math.max(1, Math.floor(Math.min(viewWidth / cols, viewHeight / rows)));
  const width = cell * cols;
  const height = cell * rows;

  return {
    left: Math.round((viewWidth - width) / 2),
    top: Math.round((viewHeight - height) / 2),
    width,
    height,
    cell,
  };
}

/**
 * Where one cell starts and how wide it is, along one axis, in whole pixels.
 *
 * With a whole-pixel cell this is just multiplication, but it stays rounded on
 * purpose: `Renderer` paints with it and `LitText` masks with it, and both read
 * the board's *measured* size, which a browser can hand back fractionally.
 * Width comes from `next edge - this edge` rather than from rounding the size,
 * so neighbours agree on the boundary they share and the squares butt together
 * with no seam and no overlap.
 */
export function cellEdges(cell: number, cellSize: number): [start: number, size: number] {
  const start = Math.round(cell * cellSize);
  return [start, Math.round((cell + 1) * cellSize) - start];
}
