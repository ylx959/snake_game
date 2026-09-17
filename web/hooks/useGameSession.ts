"use client";

/**
 * The seam between React and the framework-free modules. The only file that
 * imports both React and the socket.
 *
 * It owns the socket's lifecycle, turns each server message into React state,
 * and binds the keyboard. Nothing in `lib/` imports React; everything
 * React-shaped lives here. Nothing here decides a game rule - every field below
 * is something the server said.
 *
 * The `phase` is the one piece of state the browser owns, and it owns it only
 * because it is about which screen is showing, not about the game: the server
 * says "here is a lobby" or "here are the results", and this decides that means
 * the lobby screen. A phase can never contradict the server, because it is only
 * ever set in response to a message from it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { bindKeyboard } from "@/lib/input";
import { exposeNetProbe, netLog } from "@/lib/netstats";
import { Playout } from "@/lib/playout";
import type { BoardView } from "@/lib/renderer";
import { GameSocket } from "@/lib/websocket";
import type {
  Cell,
  ClientMessage,
  ConnectionStatus,
  GameState,
  LeaderboardEntry,
  LobbyState,
  MultiplayerState,
  Ranking,
  ServerConfig,
  ServerMessage,
} from "@/types/game";

const DEFAULT_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:8000/ws";

/** Which screen the player is on. */
export type Phase =
  | "loading"
  | "menu"
  | "solo"
  | "lobby"
  | "countdown"
  | "playing"
  | "results";

export interface SessionState {
  connection: ConnectionStatus;
  phase: Phase;
  /** This connection's own player id. Never displayed; used to find your snake. */
  you: string | null;
  config: ServerConfig | null;
  nickname: string | null;
  solo: GameState | null;
  group: MultiplayerState | null;
  lobby: LobbyState | null;
  countdown: number | null;
  rankings: Ranking[] | null;
  leaderboard: LeaderboardEntry[] | null;
  lastScore: number | null;
  /**
   * The cell your own head was last seen on in this round, kept so that dying
   * freezes the spotlight there rather than lifting it (`lib/vision.ts`). A
   * dead snake arrives with no cells, so if this is not remembered as the
   * round runs there is nothing left to centre the light on afterwards.
   */
  lastHead: Cell | null;
  error: string | null;
}

const EMPTY: SessionState = {
  connection: "connecting",
  phase: "loading",
  you: null,
  config: null,
  nickname: null,
  solo: null,
  group: null,
  lobby: null,
  countdown: null,
  rankings: null,
  leaderboard: null,
  lastScore: null,
  lastHead: null,
  error: null,
};

/**
 * One server message applied to the screen.
 *
 * A reducer rather than a pile of setters: a single message often moves several
 * things at once - arriving in a lobby sets the lobby, the phase and clears the
 * last error - and doing that in one place is what stops the screen showing a
 * half-applied message for a frame.
 */
function reduce(state: SessionState, message: ServerMessage): SessionState {
  switch (message.type) {
    case "loading":
      return { ...state, phase: "loading" };

    case "menu_ready":
      return {
        ...state,
        phase: "menu",
        you: message.you,
        nickname: message.nickname,
        config: message.config,
        solo: null,
        group: null,
        lobby: null,
        countdown: null,
        rankings: null,
        // Whatever went wrong belonged to the room being left.
        error: null,
      };

    case "nickname_set":
      return { ...state, nickname: message.nickname, error: null };

    case "state":
      return { ...state, phase: "solo", solo: message, error: null };

    case "room_created":
    case "room_joined":
      return { ...state, phase: "lobby", lobby: message.lobby, rankings: null, error: null };

    case "lobby_state": {
      // A room broadcasts its lobby whenever its roster changes - including
      // mid-round and on the results screen, when somebody disconnects. Only a
      // room that has actually gone back to WAITING should move anyone's
      // screen; anything else is a roster update that must not pull the board,
      // or the result the player is still reading, out from under them.
      const stay = state.phase !== "menu" && message.status !== "waiting";
      return {
        ...state,
        lobby: message,
        phase: stay ? state.phase : "lobby",
        rankings: message.status === "waiting" ? null : state.rankings,
      };
    }

    case "countdown":
      // The board goes with it. Every countdown is the first one: without
      // clearing `group`, a second round would count down over the previous
      // round's roster, score and name tag instead of the standalone screen.
      return {
        ...state,
        phase: "countdown",
        countdown: message.seconds,
        group: null,
        rankings: null,
        // With the board. A new round starts in the dark from its own head,
        // never from where the last one ended.
        lastHead: null,
      };

    case "game_state": {
      // The last cell your head stood on, kept for `lib/vision.ts`. Only while
      // you are alive: the tick that kills you sends an empty snake, and that
      // is exactly the moment the remembered cell has to survive.
      const mine = message.snakes.find((snake) => snake.player_id === state.you);
      const head = mine?.alive ? (mine.cells[0] ?? null) : null;

      return {
        ...state,
        phase: "playing",
        group: message,
        countdown: null,
        lastHead: head ?? state.lastHead,
      };
    }

    case "results":
      return { ...state, phase: "results", rankings: message.rankings };

    case "leaderboard":
      return {
        ...state,
        leaderboard: message.entries,
        lastScore: message.last_score ?? state.lastScore,
      };

    case "error":
      return { ...state, error: message.message };

    // `player_joined` / `player_left` are announcements; the `lobby_state` that
    // follows each one is what actually changes the screen.
    default:
      return state;
  }
}

export function useGameSession(url: string = DEFAULT_URL) {
  const [state, setState] = useState<SessionState>(EMPTY);
  const socketRef = useRef<GameSocket | null>(null);
  /**
   * Board frames wait here for their turn on an even beat; everything else
   * goes straight through. See `lib/playout.ts` - the server's clock is the
   * one that decides what happens, this only decides when it is seen.
   */
  const playoutRef = useRef(new Playout<ServerMessage>());

  useEffect(() => {
    const apply = (message: ServerMessage) => setState((current) => reduce(current, message));
    const playout = playoutRef.current;

    const socket = new GameSocket(url, {
      onMessage: (message) => {
        if (message.type === "state" || message.type === "game_state") {
          netLog.arrivals.record(performance.now());
          playout.push(message, performance.now());
          return;
        }

        // Anything else empties the queue ahead of itself, so the screen sees
        // messages in the order the socket delivered them: a `results` can
        // never overtake the last tick of its own round, and a `lobby_state`
        // for a room we just left can never be undone by a frame still in the
        // queue putting the board back.
        for (const queued of playout.flush()) apply(queued);
        apply(message);
      },
      onStatusChange: (connection) =>
        setState((current) => ({
          ...current,
          connection,
          // A dropped socket takes the room and the run with it - the server
          // holds both - so the screen goes back to waiting for one.
          ...(connection === "closed" ? { phase: "loading" as const } : {}),
        })),
    });
    socketRef.current = socket;
    socket.connect();

    // The board's own clock. It runs whatever is on screen - a menu costs one
    // `due()` call a frame, which finds an empty queue and returns.
    let frame = requestAnimationFrame(function step() {
      frame = requestAnimationFrame(step);
      for (const message of playout.due(performance.now())) apply(message);
    });

    const hideProbe = exposeNetProbe(() => ({
      depth: playout.depth,
      period: playout.period,
    }));

    return () => {
      cancelAnimationFrame(frame);
      hideProbe();
      // A new socket is a new beat, and a fresh measurement of it.
      playout.reset();
      netLog.arrivals.reset();
      netLog.paints.reset();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [url]);

  const send = useCallback((message: ClientMessage) => {
    socketRef.current?.send(message);
  }, []);

  /** Retry after a failed connection, from the loading screen's button. */
  const reconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current?.connect();
  }, []);

  const dismissError = useCallback(() => {
    setState((current) => (current.error === null ? current : { ...current, error: null }));
  }, []);

  // Steering goes through the same path in both modes; the server decides
  // whether a turn from this player counts, and refuses a spectator's.
  useEffect(() => bindKeyboard(send), [send]);

  const view: BoardView | null = useMemo(() => {
    if (state.phase === "solo" && state.solo) return { mode: "solo", state: state.solo };
    if (state.group && (state.phase === "playing" || state.phase === "results")) {
      // `you` rides along because a shared board is drawn differently for each
      // player: the fog in `lib/vision.ts` is measured from your own head.
      return { mode: "group", state: state.group, you: state.you, lastHead: state.lastHead };
    }
    return null;
  }, [state.phase, state.solo, state.group, state.you, state.lastHead]);

  /** Your own snake on a shared board, or null in solo and in the menus. */
  const me = useMemo(
    () => state.group?.snakes.find((snake) => snake.player_id === state.you) ?? null,
    [state.group, state.you],
  );

  return { ...state, view, me, send, reconnect, dismissError };
}
