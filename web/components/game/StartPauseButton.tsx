"use client";

/**
 * One button for both halves of start and pause.
 *
 * The label follows the server's status rather than a flag of its own, so it
 * cannot drift: whatever the last state said, that is what the button offers.
 * That also means it is right after a Space keypress or a reconnect, neither of
 * which goes through this component.
 *
 * The mapping is the server's, in `Game.start()` / `Game.pause()`:
 *
 * - ready   -> "Start", sends `solo_start`
 * - paused  -> "Start", sends `solo_start` (which is also how the server resumes)
 * - running -> "Pause", sends `solo_pause`
 * - game over: neither command does anything, so the button is disabled.
 *   Reset is the only way on, and it has its own button.
 */

import type { ClientMessage, GameStatus } from "@/types/game";

export function StartPauseButton({
  status,
  send,
}: {
  status: GameStatus | null;
  send: (message: ClientMessage) => void;
}) {
  const running = status === "running";

  return (
    <button
      type="button"
      // Space presses this button rather than sending a command of its own, so
      // the key and the label can never mean different things. See lib/input.ts.
      data-key="space"
      // Both labels are five characters, so the row never reflows on a toggle.
      disabled={status === "game_over"}
      onClick={() => send({ type: running ? "solo_pause" : "solo_start" })}
    >
      {running ? "Pause" : "Start"}
    </button>
  );
}
