"use client";

/**
 * A round in progress: one board, everybody's snakes, and the live standing.
 *
 * The board is the same canvas solo uses, drawing the same server state - the
 * only difference is that the state has several snakes in it. Everything around
 * it is a readout: the room code, how many are left, and the roster in the
 * corner.
 *
 * A dead player stays here. The socket is not closed, the board keeps arriving,
 * and the standing keeps updating - they simply cannot steer any more, which
 * the server enforces and this screen just says out loud.
 */

import { Hint } from "@/components/game/Hint";
import { LitText } from "@/components/game/LitText";
import { PlayerList } from "@/components/screens/PlayerList";
import type { BoardView } from "@/lib/renderer";
import type { ConnectionStatus, MultiplayerState, SnakeView } from "@/types/game";

export function GroupGameScreen({
  state,
  view,
  me,
  you,
  connection,
  countdown,
}: {
  state: MultiplayerState;
  view: BoardView | null;
  me: SnakeView | null;
  you: string | null;
  connection: ConnectionStatus;
  countdown: number | null;
}) {
  const spectating = me !== null && !me.alive;

  return (
    <>
      <header className="hud">
        <LitText view={view} className="hud__score">
          Room {state.code}
        </LitText>
        <LitText view={view} className="hud__status" data-connection={connection}>
          {connection === "open" ? `Alive ${state.alive}/${state.total}` : connection}
        </LitText>
      </header>

      <aside className="side">
        <PlayerList snakes={state.snakes} you={you} />
      </aside>

      {countdown !== null && (
        <p className="countdown" role="status">
          <LitText view={view}>{countdown}</LitText>
        </p>
      )}

      {countdown === null && spectating && (
        <p className="prompt">
          <LitText view={view}>Spectating</LitText>
        </p>
      )}

      <div className="ui__gap" />

      <Hint view={view}>
        {countdown !== null
          ? "Pick a direction · nobody moves until zero"
          : spectating
            ? "You are out · watching until the round ends"
            : "Arrows / WASD to steer · last snake alive wins"}
      </Hint>
    </>
  );
}
