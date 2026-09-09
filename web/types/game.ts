/**
 * The wire contract with the Python backend.
 *
 * Mirrors `Game.to_dict()` in backend/game/game.py - if you change a field
 * there, change it here in the same commit.
 */

/** A grid coordinate, `[x, y]`, with y growing downwards. */
export type Cell = [number, number];

export type GameStatus = "ready" | "running" | "paused" | "game_over";

export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

export interface GameState {
  /** Board size in cells, not pixels. */
  width: number;
  height: number;
  status: GameStatus;
  score: number;
  ticks: number;
  /** Head first. */
  snake: Cell[];
  direction: Direction;
  food: Cell | null;
  /**
   * Which colour pair the board is wearing. An index, never a colour: the hex
   * values live in `lib/palette.ts`. Advances by one with every apple.
   */
  palette: number;
}

/** Anything the server pushes down the socket. */
export type ServerMessage = { type: "state" } & GameState;

/** Anything the browser sends up. The server owns the outcome. */
export type ClientMessage =
  | { type: "turn"; direction: Direction }
  | { type: "start" }
  | { type: "pause" }
  | { type: "reset" }
  /**
   * The board fills the viewport, so its shape is the one piece of game state
   * only the browser knows. The server clamps what it is given and starts the
   * run over; see `gridForViewport` in `lib/board.ts`.
   */
  | { type: "resize"; width: number; height: number };

export type ConnectionStatus = "connecting" | "open" | "closed";
