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

/**
 * One cell as an SVG path: a plain rectangle, square on every corner.
 *
 * The snake is drawn as hard squares, so this is what `LitText` masks with -
 * the mask and the paint have to be the same silhouette or the white text sits
 * visibly off the snake, which is the whole reason this lives here rather than
 * in either of the two files that use it.
 *
 * Each cell is its own closed subpath. Several of them concatenated make one
 * `path()` covering the whole snake: `clip-path` fills with the nonzero rule,
 * so adjacent rectangles union instead of cancelling, and neighbours that share
 * an edge leave no seam - `cellEdges()` has already made them share it exactly.
 */
export function cellRectPath(left: number, top: number, width: number, height: number): string {
  return `M${left} ${top}H${left + width}V${top + height}H${left}Z`;
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
