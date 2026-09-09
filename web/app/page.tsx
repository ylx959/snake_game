"use client";

/**
 * The game, and the whole site. Holds the socket session, paints the palette
 * the server picked onto the document, and hands state down; the server owns
 * every rule, so this component only routes data and commands.
 *
 * The board is the background - it covers the window - and the readouts and
 * controls sit on top of it.
 */

import { GameCanvas } from "@/components/game/GameCanvas";
import { Prompt } from "@/components/game/Prompt";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import { useSnakeGame } from "@/hooks/useSnakeGame";
import { paletteAt } from "@/lib/palette";

export default function Home() {
  const { state, connection, send } = useSnakeGame();

  // The server sends an index; the hex lives in lib/palette.ts. Setting it as
  // custom properties here repaints the page, the buttons and the canvas
  // together, with no transition - the flip is meant to be abrupt.
  const { bg, fg } = paletteAt(state?.palette ?? 0);

  return (
    <main className="screen" style={{ "--bg": bg, "--fg": fg } as React.CSSProperties}>
      <GameCanvas state={state} />

      <div className="ui">
        <ScoreBoard state={state} connection={connection} />
        <Prompt status={state?.status ?? null} connection={connection} />

        <div className="ui__gap" />

        <footer className="controls">
          <button type="button" onClick={() => send({ type: "start" })}>
            Start
          </button>
          <button type="button" onClick={() => send({ type: "pause" })}>
            Pause
          </button>
          <button type="button" onClick={() => send({ type: "reset" })}>
            Reset
          </button>
        </footer>

        <p className="hint">Arrows / WASD to steer · Space to pause · R to reset</p>
      </div>
    </main>
  );
}
