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

import { netLog } from "@/lib/netstats";
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
    if (!renderer || !canvas) return;

    // No board to draw - the menus, a lobby, a loading screen. Wipe it rather
    // than returning: a canvas holds its last frame, so leaving a round left
    // the room's snakes sitting behind the menu. `sizedFor` is reset with it so
    // the next board reallocates the backing store instead of trusting a size
    // that belongs to a game that is over.
    const shape = boardShape(view);
    if (!view || !shape) {
      renderer.clear();
      sizedFor.current = { width: 0, height: 0, cols: 0, rows: 0 };
      return;
    }

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
    // The board's beat as the player actually sees it, for `window.__net()`.
    // Here rather than at the socket: this is the last line before the pixels,
    // so a frame that was received and then dropped on the floor is not
    // counted as one that was shown.
    netLog.paints.record(performance.now());
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
