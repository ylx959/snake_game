"use client";

/**
 * The board, which is the whole window. Owns the canvas element and keeps it
 * matching the viewport; everything it draws comes from the server-supplied
 * `GameState`.
 *
 * It only ever *follows* the viewport. Asking the server for a board that fits
 * is `useSnakeGame`'s job, so this component never has an opinion about how
 * many cells there should be.
 */

import { useCallback, useEffect, useRef } from "react";

import { Renderer } from "@/lib/renderer";
import type { GameState } from "@/types/game";

export function GameCanvas({ state }: { state: GameState | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const stateRef = useRef<GameState | null>(null);
  // What the canvas is currently sized for, so a tick does not resize it.
  const sizedFor = useRef({ width: 0, height: 0, cols: 0, rows: 0 });

  const paint = useCallback(() => {
    const state = stateRef.current;
    const renderer = rendererRef.current;
    if (!state || !renderer) return;

    // Resizing reallocates the backing store and wipes it, so it happens only
    // when the window or the board actually changed - not on every tick.
    const last = sizedFor.current;
    if (
      last.width !== window.innerWidth ||
      last.height !== window.innerHeight ||
      last.cols !== state.width ||
      last.rows !== state.height
    ) {
      sizedFor.current = {
        width: window.innerWidth,
        height: window.innerHeight,
        cols: state.width,
        rows: state.height,
      };
      renderer.resize(state, window.innerWidth, window.innerHeight);
    }

    renderer.draw(state);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    rendererRef.current = new Renderer(canvasRef.current);

    window.addEventListener("resize", paint);
    paint();

    return () => {
      window.removeEventListener("resize", paint);
      rendererRef.current = null;
    };
  }, [paint]);

  useEffect(() => {
    stateRef.current = state;
    paint();
  }, [state, paint]);

  return <canvas className="board" ref={canvasRef} aria-hidden="true" />;
}
