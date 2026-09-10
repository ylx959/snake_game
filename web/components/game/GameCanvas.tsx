"use client";

/**
 * The board. Owns the canvas element and keeps its backing store matching the
 * size it is laid out at; everything it draws comes from the server-supplied
 * `GameState`.
 *
 * It never decides how big it is. The canvas fills the stage, the stage is
 * sized by `useBoardRect`, and this component simply measures the box it was
 * given - so the fixed aspect ratio is decided in exactly one place.
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
    const canvas = canvasRef.current;
    if (!state || !renderer || !canvas) return;

    // The laid-out size of the canvas box, which is the stage: CSS has already
    // done the fitting, so this reads the answer rather than recomputing it.
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    // Resizing reallocates the backing store and wipes it, so it happens only
    // when the box or the board actually changed - not on every tick.
    const last = sizedFor.current;
    if (
      last.width !== width ||
      last.height !== height ||
      last.cols !== state.width ||
      last.rows !== state.height
    ) {
      sizedFor.current = { width, height, cols: state.width, rows: state.height };
      renderer.resize(state, width, height);
    }

    renderer.draw(state);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    rendererRef.current = new Renderer(canvas);

    // A ResizeObserver rather than a window listener: the canvas fills the
    // stage, and the stage is resized by a React render, which lands *after*
    // the window's resize event. Watching the element itself means the repaint
    // happens when its box actually changed, whatever caused it.
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    paint();

    return () => {
      observer.disconnect();
      rendererRef.current = null;
    };
  }, [paint]);

  useEffect(() => {
    stateRef.current = state;
    paint();
  }, [state, paint]);

  return <canvas className="board" ref={canvasRef} aria-hidden="true" />;
}
