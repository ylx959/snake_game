"use client";

/**
 * The controls line. Black, and white wherever the snake is behind it - see
 * `LitText`, which owns that effect.
 */

import { LitText } from "@/components/game/LitText";
import type { GameState } from "@/types/game";

const HINT = "Arrows / WASD to start · Space to pause <-> start · R to reset";

export function Hint({ state }: { state: GameState | null }) {
  return (
    <p className="hint">
      <LitText state={state}>{HINT}</LitText>
    </p>
  );
}
