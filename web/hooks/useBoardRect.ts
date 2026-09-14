"use client";

/**
 * Where the board goes: the largest board of the server's shape that fits the
 * window, centred, remeasured whenever the window changes.
 *
 * Null until the board's shape is known - it comes from the server, and it is
 * not the same in both modes (48x27 solo, 64x36 in a room) - so before then
 * there is nothing to fit and the stage falls back to its CSS, which fills the
 * window.
 */

import { useEffect, useState } from "react";

import { fitBoard, type BoardRect } from "@/lib/board";

export function useBoardRect(cols: number | null, rows: number | null): BoardRect | null {
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const measure = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure(); // the server render had no window to measure
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (!viewport || !cols || !rows) return null;
  return fitBoard(viewport.width, viewport.height, cols, rows);
}
