"use client";

/**
 * The board. Owns the canvas element and keeps its backing store matching the
 * size it is laid out at; everything it draws comes from server state.
 *
 * It never decides how big it is. The canvas fills the stage, the stage is
 * sized by `useBoardRect`, and this component simply measures the box it was
 * given - so the fixed aspect ratio is decided in exactly one place, and the
 * two board shapes (48x27 solo, 64x36 in a room) need no special case here.
 */

import { useCallback, useEffect, useRef } from "react";

import { Renderer, boardShape, type BoardView } from "@/lib/renderer";

export function GameCanvas({ view }: { view: BoardView | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const viewRef = useRef<BoardView | null>(null);
  // What the canvas is currently sized for, so a tick does not resize it.
  const sizedFor = useRef({ width: 0, height: 0, cols: 0, rows: 0 });

  const paint = useCallback(() => {
    const view = viewRef.current;
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    const shape = boardShape(view);
    if (!view || !shape || !renderer || !canvas) return;

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
      last.cols !== shape.cols ||
      last.rows !== shape.rows
    ) {
      sizedFor.current = { width, height, cols: shape.cols, rows: shape.rows };
      renderer.resize(shape.cols, shape.rows, width, height);
    }

    renderer.draw(view);
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
    viewRef.current = view;
    paint();
  }, [view, paint]);

  return <canvas className="board" ref={canvasRef} aria-hidden="true" />;
}
