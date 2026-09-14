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
import { PAPER, paletteAt } from "@/lib/palette";
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

  // A screen with a board on it wears that board's palette; every screen that
  // is only text - loading, the menus, a lobby, the countdown - takes the dark
  // theme in globals.css instead. The server sends an index, never a colour;
  // the hex lives in lib/palette.ts.
  //
  // Both modes send one, and each decides for itself when it turns: solo on
  // every apple, a room on every death. Setting the pair as custom properties
  // here repaints the page, the readouts and the canvas together, with no
  // transition - the flip is meant to be abrupt.
  //
  // `null` has to drop the style attribute entirely rather than set some
  // neutral pair: an inline custom property beats the stylesheet, so one left
  // behind would pin the theme at whatever the last board was wearing.
  // Solo wears the pair its run has reached. A room's board is white and never
  // changes, so it needs no pair at all - it only needs the light theme, which
  // is the stylesheet's default: black type, and a black `.boundary` marking a
  // wall that kills you in front of four other people.
  //
  // Two tokens a room has to name even though it has no pair, because both
  // fall back to `:root` - which still holds solo's *first* pair, for the sake
  // of server-rendered HTML before React takes over. Left alone, a room quietly
  // wears bits of palette 0: `--emboss` follows `--fg` and puts a red drop
  // shadow under the big type, and `--bg` is what a hovered button inverts its
  // text to, so `BACK TO LOBBY` came out cyan. `--bg` is the board here, and
  // the board is white.
  const palette = phase === "solo" ? paletteAt(session.solo?.palette ?? 0) : null;
  const onBoard = palette !== null || view?.mode === "group";

  return (
    <main
      className="screen"
      data-theme={onBoard ? undefined : "dark"}
      style={
        palette
          ? ({ "--bg": palette.bg, "--fg": palette.fg } as React.CSSProperties)
          : view?.mode === "group"
            ? ({ "--bg": PAPER, "--emboss": "transparent" } as React.CSSProperties)
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

          {phase === "playing" && session.group && (
            <GroupGameScreen
              state={session.group}
              view={view}
              me={session.me}
              you={session.you}
              connection={session.connection}
            />
          )}

          {/* Every countdown gets this screen, not only the first. There is no
              board to stand on: the reducer drops the previous round along with
              the countdown, so a rematch opens exactly as the first round did
              rather than counting down over a stale room. */}
          {phase === "countdown" && (
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
