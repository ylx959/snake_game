/**
 * How many cells the viewport is worth.
 *
 * The board covers the whole screen, so the browser is the only thing that
 * knows its shape - it measures, and the server decides what to do with the
 * answer. Nothing here is game state; it is a measurement.
 */

export interface Grid {
  cols: number;
  rows: number;
}

/** Roughly how big one cell should look, in CSS pixels. */
const TARGET_CELL_PX = 28;

// Mirrors MIN_DIMENSION / MAX_DIMENSION in backend/game/game.py. Clamping here
// too is not trust - the server clamps regardless - it just keeps the client
// from asking for something it will not get and then re-asking forever.
const MIN_CELLS = 8;
const MAX_CELLS = 240;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function gridForViewport(width: number, height: number): Grid {
  return {
    cols: clamp(Math.round(width / TARGET_CELL_PX), MIN_CELLS, MAX_CELLS),
    rows: clamp(Math.round(height / TARGET_CELL_PX), MIN_CELLS, MAX_CELLS),
  };
}

export function sameGrid(a: Grid, b: Grid): boolean {
  return a.cols === b.cols && a.rows === b.rows;
}
