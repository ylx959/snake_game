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
 * One cell as an SVG path with some of its corners rounded.
 *
 * The rounded ends of the snake - see `lib/snakeEnds.ts` - have to exist in the
 * mask as well as in the paint, so `LitText` builds them from here and
 * `Renderer` draws the same corners with `roundRect`. A radius of 0, or no
 * rounded corner at all, falls straight back to `cellRectPath`: a body cell is
 * a plain rectangle and stays byte-for-byte the path it always was, so
 * neighbours go on sharing their edges exactly.
 *
 * Clockwise, starting at the top-left corner's end, because the whole snake is
 * one concatenated `path()` filled with the nonzero rule - every subpath has to
 * wind the same way or overlapping cells would cancel instead of union.
 *
 * The radius is never allowed past half the cell: two corners on one side
 * asking for more than the side is long would make the arcs cross.
 */
export function cellRoundedPath(
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
  corners: readonly [boolean, boolean, boolean, boolean],
): string {
  const r = Math.min(radius, width / 2, height / 2);
  if (r <= 0 || !corners.some(Boolean)) return cellRectPath(left, top, width, height);

  const [tl, tr, br, bl] = corners.map((on) => (on ? r : 0));
  const right = left + width;
  const bottom = top + height;
  // `A rx ry 0 0 1 x y` - a quarter circle, sweeping clockwise.
  const arc = (x: number, y: number) => `A${r} ${r} 0 0 1 ${x} ${y}`;

  return [
    `M${left + tl} ${top}`,
    `H${right - tr}`,
    tr ? arc(right, top + tr) : "",
    `V${bottom - br}`,
    br ? arc(right - br, bottom) : "",
    `H${left + bl}`,
    bl ? arc(left, bottom - bl) : "",
    `V${top + tl}`,
    tl ? arc(left + tl, top) : "",
    "Z",
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
