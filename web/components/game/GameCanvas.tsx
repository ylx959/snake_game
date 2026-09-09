"use client";

/**
 * The board itself. Owns the canvas element and keeps it sized to the window;
 * everything it draws comes from the server-supplied `GameState`.
 */

import { useEffect, useRef } from "react";

import { Renderer } from "@/lib/renderer";
import type { GameState } from "@/types/game";

const MAX_BOARD_PX = 560;

export function GameCanvas({ state }: { state: GameState | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !state) return;

    rendererRef.current ??= new Renderer(canvasRef.current);
    const renderer = rendererRef.current;

    const fit = () => {
      const size = Math.min(MAX_BOARD_PX, window.innerWidth - 48);
      renderer.resize(state, size);
      renderer.draw(state);
    };

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [state]);

  return <canvas ref={canvasRef} className="game__canvas" />;
}
