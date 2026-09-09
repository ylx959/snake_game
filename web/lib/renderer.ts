/**
 * Canvas renderer. Stateless with respect to the game: it is handed a
 * `GameState` and draws exactly that, so it can never disagree with the server.
 *
 * It draws the board and nothing else. Every piece of text - score, status,
 * prompts, buttons - is DOM, so the pixel font is a font rather than something
 * this file has to reimplement with `fillText`.
 */

import { INK, paletteAt } from "@/lib/palette";
import type { Cell, Direction, GameState } from "@/types/game";

/** Where the head's two eyes sit, as fractions of a cell, per heading. */
const EYES: Record<Direction, readonly [number, number][]> = {
  RIGHT: [
    [0.5, 0.2],
    [0.5, 0.6],
  ],
  LEFT: [
    [0.3, 0.2],
    [0.3, 0.6],
  ],
  UP: [
    [0.2, 0.3],
    [0.6, 0.3],
  ],
  DOWN: [
    [0.2, 0.5],
    [0.6, 0.5],
  ],
};

const EYE_RATIO = 0.2;
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

  /** Two black pixels on the head, so you can tell which end is which. */
  private drawEyes(state: GameState): void {
    const { ctx } = this;
    const [left, top, width, height] = this.bounds(state.snake[0]);
    if (Math.min(width, height) < MIN_CELL_FOR_EYES) return;

    const size = Math.max(2, Math.round(Math.min(width, height) * EYE_RATIO));

    ctx.fillStyle = INK;
    for (const [ox, oy] of EYES[state.direction]) {
      ctx.fillRect(left + Math.round(width * ox), top + Math.round(height * oy), size, size);
    }
  }

  private fillCell(cell: Cell, color: string, inset: number): void {
    const [left, top, width, height] = this.bounds(cell);
    const padX = Math.round(width * inset);
    const padY = Math.round(height * inset);

    this.ctx.fillStyle = color;
    this.ctx.fillRect(left + padX, top + padY, width - padX * 2, height - padY * 2);
  }

  /** A cell's pixel rectangle, snapped to whole pixels on every edge. */
  private bounds([x, y]: Cell): [number, number, number, number] {
    const left = Math.round(x * this.cellWidth);
    const top = Math.round(y * this.cellHeight);
    return [
      left,
      top,
      Math.round((x + 1) * this.cellWidth) - left,
      Math.round((y + 1) * this.cellHeight) - top,
    ];
  }
}
