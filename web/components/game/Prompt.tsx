"use client";

/**
 * The one big line of text, in the spirit of the reference art: a single
 * sentence over a flat field, with a blinking caret after it.
 *
 * Blank while the game is running - there is nothing to say.
 *
 * It sits dead centre, which is where the snake starts and where it crosses
 * most often, so the line is lit like the other readouts: black, and white
 * wherever the snake is behind it. See `LitText`.
 */

import { LitText } from "@/components/game/LitText";
import type { ConnectionStatus, GameState, GameStatus } from "@/types/game";

const PROMPT: Record<GameStatus, string> = {
  ready: "Press an arrow to start",
  running: "",
  paused: "Paused",
  game_over: "Game over",
};

export function Prompt({
  state,
  connection,
}: {
  state: GameState | null;
  connection: ConnectionStatus;
}) {
  // A dead socket outranks anything the last state said: the board on screen is
  // already stale, and reconnecting is the only thing happening.
  const text = connection === "open" ? (state ? PROMPT[state.status] : "") : "Connecting";

  return (
    <p className="prompt">
      {text && (
        <LitText state={state}>
          {text}
          <span className="prompt__caret" aria-hidden="true" />
        </LitText>
      )}
    </p>
  );
}
