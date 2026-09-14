"use client";

/**
 * A round in progress.
 *
 * Deliberately the same screen as solo: the same board, the same readout at the
 * top, the same one line of text in the middle, the same hint along the bottom.
 * Only three things differ, and each is something a shared board actually needs
 * - the ground is black and stays black, each snake carries its player's
 * colour, and a small tag rides your own head so you can find yourself.
 *
 * Everything around the board is a readout. Nothing here decides anything.
 *
 * A dead player stays on this screen. The socket is not closed, the board keeps
 * arriving, and the standing keeps updating - they simply cannot steer any
 * more, which the server enforces and this only says out loud.
 */

import { Hint } from "@/components/game/Hint";
import { LitText } from "@/components/game/LitText";
import { NameTag } from "@/components/game/NameTag";
import { PlayerList } from "@/components/screens/PlayerList";
import type { BoardView } from "@/lib/renderer";
import type { ConnectionStatus, MultiplayerState, SnakeView } from "@/types/game";

export function GroupGameScreen({
  state,
  view,
  me,
  you,
  connection,
}: {
  state: MultiplayerState;
  view: BoardView | null;
  me: SnakeView | null;
  you: string | null;
  connection: ConnectionStatus;
}) {
  const spectating = me !== null && !me.alive;

  return (
    <>
      {/* Where the walls are. A black snake board on a black page has no
          visible edge; solo needs no such line, because its ground is a palette
          colour and the board's edge is the edge of the colour. */}
      <div className="boundary" aria-hidden="true" />

      {/* The same two-item row solo uses: your score on the left, the thing you
          can act on on the right. */}
      <header className="hud">
        <LitText view={view} className="hud__score">
          Score {String(me?.score ?? 0).padStart(3, "0")}
        </LitText>
        <LitText view={view} className="hud__status" data-connection={connection}>
          {connection === "open" ? `Alive ${state.alive}/${state.total}` : connection}
        </LitText>
      </header>

      {/* The roster the shared board needs and solo does not. It sits in a
          corner rather than following five heads around: labels chasing every
          snake would cover the board, and on a phone most of it. */}
      <aside className="side">
        <p className="side__code">Room {state.code}</p>
        <PlayerList snakes={state.snakes} you={you} />
      </aside>

      <NameTag snake={me} cols={state.width} rows={state.height} />

      {spectating && (
        <p className="prompt">
          <LitText view={view}>Spectating</LitText>
        </p>
      )}

      <div className="ui__gap" />

      <Hint view={view}>
        {spectating
          ? "You are out · watching until the round ends"
          : "Arrows / WASD to steer · last snake alive wins"}
      </Hint>
    </>
  );
}
