"use client";

/**
 * Where the board goes: the largest board of the server's shape that fits the
 * window, centred, remeasured whenever the window changes.
 *
 * Null until the first state arrives - the board's shape comes from the server,
 * so before then there is nothing to fit and the stage falls back to its CSS,
 * which fills the window.
 */

import { useEffect, useState } from "react";

import { fitBoard, type BoardRect } from "@/lib/board";
import type { GameState } from "@/types/game";

export function useBoardRect(state: GameState | null): BoardRect | null {
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const measure = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure(); // the server render had no window to measure
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (!viewport || !state) return null;
  return fitBoard(viewport.width, viewport.height, state.width, state.height);
}
