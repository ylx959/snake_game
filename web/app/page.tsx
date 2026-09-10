"use client";

/**
 * The game, and the whole site. Holds the socket session, paints the palette
 * the server picked onto the document, and hands state down; the server owns
 * every rule, so this component only routes data and commands.
 *
 * The stage is the game: a box of the server's aspect ratio, as large as the
 * window allows, centred. Everything - the canvas, the readouts, the controls -
 * lives inside it and is measured in cells, so resizing the window scales the
 * whole thing by one factor instead of reshaping it.
 */

import { GameCanvas } from "@/components/game/GameCanvas";
import { Hint } from "@/components/game/Hint";
import { Prompt } from "@/components/game/Prompt";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import { StartPauseButton } from "@/components/game/StartPauseButton";
import { useBoardRect } from "@/hooks/useBoardRect";
import { useSnakeGame } from "@/hooks/useSnakeGame";
import { paletteAt } from "@/lib/palette";

export default function Home() {
  const { state, connection, send } = useSnakeGame();
  const board = useBoardRect(state);

  // The server sends an index; the hex lives in lib/palette.ts. Setting it as
  // custom properties here repaints the page, the buttons and the canvas
  // together, with no transition - the flip is meant to be abrupt.
  const { bg, fg } = paletteAt(state?.palette ?? 0);

  return (
    <main className="screen" style={{ "--bg": bg, "--fg": fg } as React.CSSProperties}>
      <div
        className="stage"
        style={
          board
            ? // `--cell` is the unit the whole interface is drawn in, so the
              // text and the buttons scale with the board rather than with the
              // window. Without a board there is nothing to fit yet, and the
              // stage's CSS fills the window instead.
              ({
                left: board.left,
                top: board.top,
                width: board.width,
                height: board.height,
                "--cell": `${board.cell}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <GameCanvas state={state} />

        <div className="ui">
          <ScoreBoard state={state} connection={connection} />
          <Prompt state={state} connection={connection} />

          <div className="ui__gap" />

          {/* 跑起來的時候收起來，畫面上只剩棋盤；暫停、reset、game over 才回來。
              按鈕本身留在 DOM 裡——Space / R 是靠「按那顆按鈕」生效的。 */}
          <footer className="controls" data-hidden={state?.status === "running" || undefined}>
            <StartPauseButton status={state?.status ?? null} send={send} />
            {/* data-key: R presses this button; lib/input.ts routes it here. */}
            <button type="button" data-key="r" onClick={() => send({ type: "reset" })}>
              Reset
            </button>
          </footer>

          <Hint state={state} />
        </div>
      </div>
    </main>
  );
}
