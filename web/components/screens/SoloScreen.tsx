"use client";

/**
 * Solo: the game that was here first, unchanged.
 *
 * Same board, same controls, same feel - arrows or WASD steer and start, Space
 * pauses, R resets - and the server still owns every rule. The one thing added
 * is what happens at the end: the server writes the finished run to the global
 * table itself and sends the table back, so the browser never gets to say what
 * anyone scored.
 */

import { Hint } from "@/components/game/Hint";
import { Prompt } from "@/components/game/Prompt";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import { StartPauseButton } from "@/components/game/StartPauseButton";
import { LeaderboardTable } from "@/components/screens/LeaderboardTable";
import { Panel } from "@/components/ui/Panel";
import type { BoardView } from "@/lib/renderer";
import type { ClientMessage, ConnectionStatus, GameState, LeaderboardEntry } from "@/types/game";

export function SoloScreen({
  state,
  view,
  connection,
  leaderboard,
  lastScore,
  send,
}: {
  state: GameState | null;
  view: BoardView | null;
  connection: ConnectionStatus;
  leaderboard: LeaderboardEntry[] | null;
  lastScore: number | null;
  send: (message: ClientMessage) => void;
}) {
  const over = state?.status === "game_over";
  const score = lastScore ?? state?.score ?? 0;

  return (
    <>
      <ScoreBoard state={state} connection={connection} view={view} />
      {!over && <Prompt state={state} connection={connection} view={view} />}

      <div className="ui__gap" />

      {over && (
        <Panel title="Game over" size="narrow" tone="ink">
          <p className="bigscore">{String(score).padStart(3, "0")}</p>
          {/* A scoreless run is not written down, so say so - otherwise the
              player looks for a row that was never going to be there. */}
          {score === 0 && (
            <p className="field__note">Eat at least one apple to make the table</p>
          )}
          <h2 className="panel__heading">Global top 10</h2>
          <LeaderboardTable entries={leaderboard} />
        </Panel>
      )}

      {/* Hidden while running so the board is uncluttered in play. The buttons
          stay in the DOM either way - Space and R work by clicking them. */}
      <footer className="controls" data-hidden={state?.status === "running" || undefined}>
        <StartPauseButton status={state?.status ?? null} send={send} />
        {/* data-key: R presses this button; lib/input.ts routes it here. */}
        <button type="button" data-key="r" onClick={() => send({ type: "solo_reset" })}>
          Reset
        </button>
        <button type="button" onClick={() => send({ type: "solo_exit" })}>
          Menu
        </button>
      </footer>

      <Hint view={view}>
        {over
          ? "R to play again · Menu to go back"
          : "Arrows / WASD to start · Space to pause <-> start · R to reset"}
      </Hint>
    </>
  );
}
