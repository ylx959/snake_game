"use client";

/**
 * The live roster during a round: who is playing, in what colour, on what
 * score, and whether they are still in it.
 *
 * It sits in a corner rather than floating names over the snakes. Labels
 * following five heads around a board cover the board, and on a phone they
 * cover most of it; a fixed list stays legible at any size and never hides the
 * thing the player is trying to steer through.
 *
 * Colour is never the only cue. Each row is numbered, named, and says ALIVE or
 * DEAD in words - and your own row is marked, so finding yourself does not
 * depend on telling the red from the green.
 */

import { playerColorAt } from "@/lib/palette";
import type { SnakeView } from "@/types/game";

export function PlayerList({ snakes, you }: { snakes: SnakeView[]; you: string | null }) {
  // Alive first, then by score: the table reads as a live standing.
  const ordered = [...snakes].sort(
    (a, b) => Number(b.alive) - Number(a.alive) || b.score - a.score,
  );

  return (
    <ul className="players">
      {ordered.map((snake, index) => (
        <li
          className="players__row"
          key={snake.player_id}
          data-dead={snake.alive ? undefined : ""}
          data-you={snake.player_id === you ? "" : undefined}
        >
          <span className="players__rank">{index + 1}</span>
          <span
            className="swatch"
            style={{ background: playerColorAt(snake.color) }}
            aria-hidden="true"
          />
          <span className="players__name">
            {snake.nickname}
            {snake.player_id === you && <span className="badge">You</span>}
          </span>
          <span className="players__score">{String(snake.score).padStart(2, "0")}</span>
          <span className="players__state">{snake.alive ? "Alive" : "Dead"}</span>
        </li>
      ))}
    </ul>
  );
}
