"use client";

/**
 * The whole site: one socket, one stage, and whichever screen the session is
 * on. The server owns every rule, so this component only routes data and
 * commands - it decides which screen a message means, never what a message
 * means to the game.
 *
 * The stage is the game: a box of the board's aspect ratio, as large as the
 * window allows, centred. Everything - the canvas, the readouts, the menus -
 * lives inside it and is measured in cells, so resizing the window scales the
 * whole thing by one factor instead of reshaping it. Both boards are exactly
 * 16:9 (48x27 solo, 64x36 in a room), so switching modes changes how fine the
 * grid is and nothing about the shape of the page.
 */

import { GameCanvas } from "@/components/game/GameCanvas";
import { GroupGameScreen } from "@/components/screens/GroupGameScreen";
import { LoadingScreen } from "@/components/screens/LoadingScreen";
import { LobbyScreen } from "@/components/screens/LobbyScreen";
import { MenuScreen } from "@/components/screens/MenuScreen";
import { ResultsScreen } from "@/components/screens/ResultsScreen";
import { SoloScreen } from "@/components/screens/SoloScreen";
import { useBoardRect } from "@/hooks/useBoardRect";
import { useGameSession } from "@/hooks/useGameSession";
import { paletteAt } from "@/lib/palette";
import { boardShape } from "@/lib/renderer";

/** The solo board, and the shape of the page before the server has spoken. */
const FALLBACK = { cols: 48, rows: 27 };

export default function Home() {
  const session = useGameSession();
  const { phase, view, config } = session;

  // A board if there is one; otherwise the shape the menus letterbox to. Both
  // are 16:9, so this never changes the page's proportions - only its grid.
  const inRoom = phase === "lobby" || phase === "countdown" || phase === "playing" || phase === "results";
  const shape =
    boardShape(view) ??
    (inRoom && config
      ? { cols: config.multi.width, rows: config.multi.height }
      : config
        ? { cols: config.solo.width, rows: config.solo.height }
        : FALLBACK);

  const board = useBoardRect(shape.cols, shape.rows);

  // The palette belongs to a solo run and to nothing else. The server sends an
  // index; the hex lives in lib/palette.ts. Setting it as custom properties
  // here repaints the page, the buttons and the canvas together, with no
  // transition - the flip is meant to be abrupt.
  //
  // Every other screen - loading, the menus, a lobby, a shared board, a result -
  // takes the dark theme in globals.css: black ground, white type, no palette.
  // The style attribute has to be dropped entirely for those, not set to some
  // neutral pair: an inline custom property beats the stylesheet, so leaving
  // one behind would pin the theme at whatever the last solo run was wearing.
  const palette = paletteAt(session.solo?.palette ?? 0);

  return (
    <main
      className="screen"
      data-theme={phase === "solo" ? undefined : "dark"}
      style={
        phase === "solo"
          ? ({ "--bg": palette.bg, "--fg": palette.fg } as React.CSSProperties)
          : undefined
      }
    >
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
        <GameCanvas view={view} />

        <div className="ui">
          {phase === "loading" && (
            <LoadingScreen connection={session.connection} onRetry={session.reconnect} />
          )}

          {phase === "menu" && (
            <MenuScreen
              send={session.send}
              setNickname={session.setNickname}
              nickname={session.nickname}
              config={session.config}
              leaderboard={session.leaderboard}
              error={session.error}
              dismissError={session.dismissError}
            />
          )}

          {phase === "solo" && (
            <SoloScreen
              state={session.solo}
              view={view}
              connection={session.connection}
              leaderboard={session.leaderboard}
              lastScore={session.lastScore}
              send={session.send}
            />
          )}

          {phase === "lobby" && session.lobby && (
            <LobbyScreen
              lobby={session.lobby}
              you={session.you}
              send={session.send}
              error={session.error}
            />
          )}

          {(phase === "countdown" || phase === "playing") && session.group && (
            <GroupGameScreen
              state={session.group}
              view={view}
              me={session.me}
              you={session.you}
              connection={session.connection}
              countdown={session.countdown}
            />
          )}

          {/* The countdown lands before the first board does, so it needs a
              screen of its own for those few hundred milliseconds. */}
          {phase === "countdown" && !session.group && (
            <div className="screenful">
              <p className="countdown countdown--inline">{session.countdown}</p>
              <p className="lede">Everybody starts together</p>
            </div>
          )}

          {phase === "results" && session.rankings && (
            <ResultsScreen
              rankings={session.rankings}
              you={session.you}
              send={session.send}
            />
          )}
        </div>
      </div>
    </main>
  );
}
