/**
 * Canvas renderer. Stateless with respect to the game: it is handed a
 * `GameState` and draws exactly that, so it can never disagree with the server.
 */

import type { Cell, GameState } from "@/types/game";

export interface RendererTheme {
  background: string;
  grid: string;
  snakeHead: string;
  snakeBody: string;
  food: string;
}

export const DEFAULT_THEME: RendererTheme = {
  background: "#0f1117",
  grid: "#1b1f2a",
  snakeHead: "#5eead4",
  snakeBody: "#2dd4bf",
  food: "#f472b6",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cellSize = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly theme: RendererTheme = DEFAULT_THEME,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  /**
   * Size the canvas to the board. Call whenever the board dimensions or the
   * available pixel width change; `cssSize` is the on-screen edge length.
   */
  resize(state: GameState, cssSize: number): void {
    const dpr = window.devicePixelRatio || 1;
    // `cssSize` bounds the longest edge; each axis then gets its own extent so
    // a non-square board is not stretched into a square.
    // At least 1px: a board longer than `cssSize` would otherwise floor to a
    // zero-sized canvas and draw nothing at all.
    this.cellSize = Math.max(1, Math.floor(cssSize / Math.max(state.width, state.height)));
    const width = this.cellSize * state.width;
    const height = this.cellSize * state.height;

    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(state: GameState): void {
    const { ctx, cellSize } = this;
    const w = state.width * cellSize;
    const h = state.height * cellSize;

    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, w, h);
    this.drawGrid(state);

    if (state.food) this.fillCell(state.food, this.theme.food, 0.28);

    state.snake.forEach((cell, index) => {
      this.fillCell(cell, index === 0 ? this.theme.snakeHead : this.theme.snakeBody, 0.22);
    });

    if (state.status === "game_over") {
      this.drawOverlay(state, "GAME OVER", `Score ${state.score} · press R to restart`);
    } else if (state.status === "paused") {
      this.drawOverlay(state, "PAUSED", "press Space to resume");
    } else if (state.status === "ready") {
      this.drawOverlay(state, "READY", "press an arrow key to start");
    }
  }

  /** Dims the board and centres a title with a smaller line beneath it. */
  private drawOverlay(state: GameState, title: string, hint: string): void {
    const { ctx, cellSize } = this;
    const w = state.width * cellSize;
    const h = state.height * cellSize;

    ctx.fillStyle = "rgba(15, 17, 23, 0.72)";
    ctx.fillRect(0, 0, w, h);

    // Type is sized from the rendered board, not from a cell. Cell size tracks
    // the board's dimensions - a 160x90 board has 3px cells - so text scaled
    // from it silently becomes unreadable when the board grows.
    const titleSize = clamp(Math.min(w, h) * 0.12, 18, 64);
    const hintSize = clamp(titleSize * 0.42, 11, 22);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = this.theme.snakeHead;
    ctx.font = `600 ${Math.round(titleSize)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(title, w / 2, h / 2 - titleSize * 0.4);

    ctx.fillStyle = "rgba(230, 232, 239, 0.75)";
    ctx.font = `${Math.round(hintSize)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(hint, w / 2, h / 2 + titleSize * 0.75);
  }

  private drawGrid(state: GameState): void {
    const { ctx, cellSize } = this;
    ctx.strokeStyle = this.theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= state.width; x += 1) {
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, state.height * cellSize);
    }
    for (let y = 0; y <= state.height; y += 1) {
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(state.width * cellSize, y * cellSize + 0.5);
    }
    ctx.stroke();
  }

  /** `radiusRatio` rounds the corners as a fraction of the cell size. */
  private fillCell([x, y]: Cell, color: string, radiusRatio: number): void {
    const { ctx, cellSize } = this;
    const pad = Math.max(1, cellSize * 0.08);
    const size = cellSize - pad * 2;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x * cellSize + pad, y * cellSize + pad, size, size, size * radiusRatio);
    ctx.fill();
  }
}
