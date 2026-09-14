"use client";

/**
 * The controls line. Black, and white wherever the snake is behind it - see
 * `LitText`, which owns that effect.
 */

import { LitText } from "@/components/game/LitText";
import type { BoardView } from "@/lib/renderer";

export function Hint({ view, children }: { view: BoardView | null; children: React.ReactNode }) {
  return (
    <p className="hint">
      <LitText view={view}>{children}</LitText>
    </p>
  );
}
