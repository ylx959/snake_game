/**
 * Canvas renderer. Stateless with respect to the game: it is handed a
 * `GameState` and draws exactly that, so it can never disagree with the server.
 *
 * It draws the board and nothing else. Every piece of text - score, status,
 * prompts, buttons, the hint - is DOM, so the pixel font is a font rather than
 * something this file has to reimplement with `fillText`.
 */

import { cellEdges } from "@/lib/board";
import { INK, paletteAt } from "@/lib/palette";
import type { Cell, Direction, GameState } from "@/types/game";

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
   * Size the canvas to the viewport. The board fills it exactly, so the cell
   * size is whatever the board divides into - fractional, and very slightly
   * non-square when the viewport does not divide evenly.
   *
   * That fraction never reaches the screen: `bounds()` rounds each cell's edges
   * to whole pixels, and neighbours round the shared edge to the same integer.
   * Squares stay hard-edged and butt together with no seam between them.
   */
  resize(state: GameState, boxWidth: number, boxHeight: number): void {
    const dpr = window.devicePixelRatio || 1;

    this.canvas.style.width = `${boxWidth}px`;
    this.canvas.style.height = `${boxHeight}px`;
    this.canvas.width = Math.round(boxWidth * dpr);
    this.canvas.height = Math.round(boxHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;

    this.cellWidth = boxWidth / state.width;
    this.cellHeight = boxHeight / state.height;
  }

  draw(state: GameState): void {
    const { ctx } = this;
    const { bg, fg } = paletteAt(state.palette);

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, state.width * this.cellWidth, state.height * this.cellHeight);

    if (state.food) this.fillCell(state.food, INK, FOOD_INSET);
    for (const cell of state.snake) this.fillCell(cell, fg, 0);
    this.drawEyes(state);
  }


  /** Two black bars on the head, so you can tell which end is which. */
  private drawEyes(state: GameState): void {
    const { ctx } = this;
    const [left, top, width, height] = this.bounds(state.snake[0]);
    if (Math.min(width, height) < MIN_CELL_FOR_EYES) return;

    const { horizontal, ahead } = EYES[state.direction];
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

  private fillCell(cell: Cell, color: string, inset: number): void {
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
   * `Hint` masks itself with these rectangles, and a mask that rounds even one
   * edge differently from the paint would sit visibly off the snake.
   */
  private bounds([x, y]: Cell): [number, number, number, number] {
    const [left, width] = cellEdges(x, this.cellWidth);
    const [top, height] = cellEdges(y, this.cellHeight);
    return [left, top, width, height];
  }
}
