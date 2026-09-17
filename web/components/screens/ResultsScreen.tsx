"use client";

/**
 * The room's final table.
 *
 * The order is the server's: survival first, score second, and players level on
 * both share a place. Nothing here is computed in the browser - it is the same
 * `rankings` every player in the room was sent.
 *
 * "Play again" returns the whole room to its lobby, keeping the code, so nobody
 * has to type it twice; starting the next round is still the host's alone.
 */

import { Panel } from "@/components/ui/Panel";
import { playerColorAt } from "@/lib/palette";
import type { ClientMessage, Ranking } from "@/types/game";

export function ResultsScreen({
  rankings,
  you,
  send,
}: {
  rankings: Ranking[];
  you: string | null;
  send: (message: ClientMessage) => void;
}) {
  const mine = rankings.find((entry) => entry.player_id === you);

  return (
    <Panel
      // What it says to *you*, because the table below already says what
      // happened to everybody. `mine` is missing only for somebody who was not
      // in the round at all, and neither word is true for them.
      title={mine ? (mine.place === 1 ? "You win" : "You lose") : "Round over"}
      size="wide"
      footer={
        <>
          <button type="button" onClick={() => send({ type: "leave_room" })}>
            Leave room
          </button>
          <button type="button" onClick={() => send({ type: "play_again" })}>
            Back to lobby
          </button>
        </>
      }
    >
      <ol className="table">
        {rankings.map((entry) => (
          <li
            className="table__row"
            key={entry.player_id}
            data-you={entry.player_id === you ? "" : undefined}
          >
            <span className="table__rank">{String(entry.place).padStart(2, "0")}</span>
            <span
              className="swatch"
              style={{ background: playerColorAt(entry.color) }}
              aria-hidden="true"
            />
            <span className="table__name">
              {entry.nickname}
              {entry.player_id === you && <span className="badge">You</span>}
            </span>
            <span className="table__score">{String(entry.score).padStart(3, "0")}</span>
          </li>
        ))}
      </ol>
      <p className="field__note">
        Room scores stay in the room - only solo runs reach the global table.
      </p>
    </Panel>
  );
}
