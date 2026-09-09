"use client";

/**
 * The one big line of text, in the spirit of the reference art: a single
 * sentence over a flat field, with a blinking caret after it.
 *
 * Blank while the game is running - there is nothing to say, and the row keeps
 * its height in CSS so the board never jumps.
 */

import type { ConnectionStatus, GameStatus } from "@/types/game";

const PROMPT: Record<GameStatus, string> = {
  ready: "Press an arrow to start",
  running: "",
  paused: "Paused",
  game_over: "Game over",
};

export function Prompt({
  status,
  connection,
}: {
  status: GameStatus | null;
  connection: ConnectionStatus;
}) {
  // A dead socket outranks anything the last state said: the board on screen is
  // already stale, and reconnecting is the only thing happening.
  const text =
    connection === "open" ? (status ? PROMPT[status] : "") : "Connecting";

  return (
    <p className="prompt">
      {text}
      {text && <span className="prompt__caret" aria-hidden="true" />}
    </p>
  );
}
