/**
 * Canvas renderer. Stateless with respect to the game: it is handed a view of
 * server state and draws exactly that, so it can never disagree with the
 * server.
 *
 * It draws the board and nothing else. Every piece of text - score, status,
 * prompts, buttons, the hint, the player list - is DOM, so the pixel font is a
 * font rather than something this file has to reimplement with `fillText`.
 */

import { cellEdges } from "@/lib/board";
import { INK, PAPER, paletteAt, playerColorAt } from "@/lib/palette";
import type { Cell, Direction, GameState, MultiplayerState } from "@/types/game";

/**
 * What the canvas is being asked to draw. One board, two shapes of state: solo
 * has a single snake the server already knows everything about, a room has
 * several and a "which one is mine".
 */
export type BoardView =
  | { mode: "solo"; state: GameState }
  | { mode: "group"; state: MultiplayerState };

/**
 * The head's eyes: two fully rounded bars that run along the way the snake is
 * heading, pushed toward the leading edge of the cell.
 *
 * The numbers are the reference drawing measured on a 54x54 cell, kept as
 * fractions of it so they scale with any cell size: each bar is 25 long and 13
 * thick, its long axis centred at 36.5, and the pair sitting 11.5 either side
 * of the middle.
 */
const EYE_LENGTH = 25 / 54;
const EYE_THICKNESS = 13 / 54;
/** Distance from the trailing edge to the bars' long-axis centre. */
const EYE_AHEAD = 36.5 / 54;
/** How far each bar sits from the cell's centre line. */
const EYE_SPREAD = 11.5 / 54;

/**
 * Which way the bars lie, and how far along that axis they sit. UP and LEFT
 * lead toward the low end of their axis, so their pair mirrors.
 */
const EYES: Record<Direction, { horizontal: boolean; ahead: number }> = {
  RIGHT: { horizontal: true, ahead: EYE_AHEAD },
  LEFT: { horizontal: true, ahead: 1 - EYE_AHEAD },
  DOWN: { horizontal: false, ahead: EYE_AHEAD },
  UP: { horizontal: false, ahead: 1 - EYE_AHEAD },
};

/** Below this the eyes are a smudge, so they are dropped instead. */
const MIN_CELL_FOR_EYES = 10;

/** How far the apple is inset, so it reads as an object and not a wall tile. */
const FOOD_INSET = 0.14;

/** The cells of every snake in a view, for the DOM text mask to clip against. */
export function litCells(view: BoardView | null): Cell[] {
  if (!view) return [];
  if (view.mode === "solo") return view.state.snake;
  return view.state.snakes.flatMap((snake) => snake.cells);
}

/** The board's shape, in cells. */
export function boardShape(view: BoardView | null): { cols: number; rows: number } | null {
  if (!view) return null;
  return { cols: view.state.width, rows: view.state.height };
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cellWidth = 0;
  private cellHeight = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  /**
   * Point the backing store at a box of this size.
   *
   * It does **not** touch `style.width` / `style.height`. CSS lays the canvas
   * out (it fills the stage), and an inline size written here would override
   * that rule and pin the element at whatever it measured first - the board
   * would then stay that size for ever while the window shrank around it.
   * The element's size is CSS's; only the pixel buffer is this class's.
   */
  resize(cols: number, rows: number, boxWidth: number, boxHeight: number): void {
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(boxWidth * dpr);
    this.canvas.height = Math.round(boxHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;

    this.cellWidth = boxWidth / cols;
    this.cellHeight = boxHeight / rows;
  }

  /**
   * Wipe the board.
   *
   * A canvas keeps its last frame for ever unless something says otherwise, so
   * leaving a round for the menu left the room's snakes sitting behind the
   * menu - and then stretched, because the stage changes shape between the two
   * board sizes while the backing store still held the old picture.
   *
   * The transform is reset first: `draw` leaves a device-pixel-ratio scale on
   * the context, and clearing `canvas.width` x `canvas.height` through that
   * scale would wipe only the top-left corner on any display where the ratio
   * is not 1.
   */
  clear(): void {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  draw(view: BoardView): void {
    const { ctx } = this;
    const { state } = view;

    // A solo run wears the palette. A shared board does not: it is black, and
    // stays black, which is what lets five player colours read the same way in
    // every round instead of against a ground that moves under them. The white
    // frame marking its edge is DOM, not canvas - see `.boundary`.
    ctx.fillStyle = view.mode === "solo" ? paletteAt(state.palette).bg : INK;
    ctx.fillRect(0, 0, state.width * this.cellWidth, state.height * this.cellHeight);

    if (view.mode === "solo") this.drawSolo(view.state);
    else this.drawGroup(view.state);
  }

  // --- solo: unchanged, and deliberately so ------------------------------

  private drawSolo(state: GameState): void {
    const { fg } = paletteAt(state.palette);

    if (state.food) this.fillCell(state.food, INK, FOOD_INSET);
    for (const cell of state.snake) this.fillCell(cell, fg);
    if (state.snake.length > 0) this.drawEyes(state.snake[0], state.direction);
  }

  // --- a shared board ----------------------------------------------------

  private drawGroup(state: MultiplayerState): void {
    // White, not black: the apple is black on every palette because black is
    // the one colour legible on all eight of them - and on this board black is
    // the ground, so it inverts with it.
    for (const cell of state.food) this.fillCell(cell, PAPER, FOOD_INSET);

    // Exactly the same segment as solo draws: the same hard square, the same
    // black eyes on the head. Only the fill differs, and only because five
    // snakes have to be told apart. A shared board is meant to look like the
    // game, not like a different one.
    //
    // Bodies first, then every head's eyes, so a head another snake is drawn
    // over still shows which way it was looking.
    for (const snake of state.snakes) {
      if (!snake.alive) continue; // a dead snake is off the board
      const color = playerColorAt(snake.color);
      for (const cell of snake.cells) this.fillCell(cell, color);
    }

    for (const snake of state.snakes) {
      if (snake.alive && snake.cells.length > 0) {
        this.drawEyes(snake.cells[0], snake.direction);
      }
    }
  }

  // --- pieces -------------------------------------------------------------

  /** Two black bars on the head, so you can tell which end is which. */
  private drawEyes(head: Cell, direction: Direction): void {
    const { ctx } = this;
    const [left, top, width, height] = this.bounds(head);
    if (Math.min(width, height) < MIN_CELL_FOR_EYES) return;

    const { horizontal, ahead } = EYES[direction];
    const along = horizontal ? width : height;
    const across = horizontal ? height : width;

    // Whole pixels, so the straight sides stay hard; only the rounded caps are
    // ever antialiased.
    const barAlong = Math.max(2, Math.round(EYE_LENGTH * along));
    const barAcross = Math.max(2, Math.round(EYE_THICKNESS * across));
    const alongPos = Math.round(ahead * along - barAlong / 2);

    // Place the near bar, then mirror it. Rounding each bar independently lets
    // one round up and the other down, which lands the pair a pixel off centre.
    const near = Math.round((0.5 - EYE_SPREAD) * across - barAcross / 2);
    const far = across - barAcross - near;

    ctx.fillStyle = INK;
    for (const acrossPos of [near, far]) {
      const x = left + (horizontal ? alongPos : acrossPos);
      const y = top + (horizontal ? acrossPos : alongPos);
      const w = horizontal ? barAlong : barAcross;
      const h = horizontal ? barAcross : barAlong;

      ctx.beginPath();
      // A radius of half the short side turns the rectangle into a capsule.
      ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
      ctx.fill();
    }
  }

  /**
   * One cell, filled. A snake segment takes the whole cell (`inset` 0); the
   * apple is inset so it reads as an object rather than a wall tile.
   *
   * `fillRect` with no rounding anywhere: the edges `bounds()` hands back are
   * whole pixels and neighbours share them exactly, so segments tile with no
   * seam and nothing on the snake is ever antialiased.
   */
  private fillCell(cell: Cell, color: string, inset = 0): void {
    const [left, top, width, height] = this.bounds(cell);
    const padX = Math.round(width * inset);
    const padY = Math.round(height * inset);

    this.ctx.fillStyle = color;
    this.ctx.fillRect(left + padX, top + padY, width - padX * 2, height - padY * 2);
  }

  /**
   * A cell's pixel rectangle, snapped to whole pixels on every edge.
   *
   * The rule lives in `lib/board.ts` because the DOM needs the same answer:
   * `LitText` masks itself with these rectangles, and a mask that rounds even
   * one edge differently from the paint would sit visibly off the snake.
   */
  private bounds([x, y]: Cell): [number, number, number, number] {
    const [left, width] = cellEdges(x, this.cellWidth);
    const [top, height] = cellEdges(y, this.cellHeight);
    return [left, top, width, height];
  }
}
