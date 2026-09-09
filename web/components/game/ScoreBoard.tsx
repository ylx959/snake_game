"use client";

/**
 * Score and connection readout. Presentational only - it reports what the
 * server said and never derives game state of its own.
 */

import type { ConnectionStatus, GameState } from "@/types/game";

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  running: "Playing",
  paused: "Paused",
  game_over: "Game Over",
};

export function ScoreBoard({
  state,
  connection,
}: {
  state: GameState | null;
  connection: ConnectionStatus;
}) {
  // Until the socket is open there is no game to describe, so show the
  // connection instead - it is the thing the player can actually act on.
  const label =
    connection === "open" ? (STATUS_LABEL[state?.status ?? ""] ?? "…") : connection;

  return (
    <header className="game__hud">
      <span className="game__score">Score {state?.score ?? 0}</span>
      <span className="game__status" data-connection={connection}>
        {label}
      </span>
    </header>
  );
}
