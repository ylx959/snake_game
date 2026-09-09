"use client";

/**
 * The seam between React and the framework-free game modules.
 *
 * Owns the socket lifecycle, mirrors server state into React state, wires the
 * keyboard, and tells the server how many cells the viewport is worth. Nothing
 * in `lib/` imports React; everything React-shaped lives here.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { gridForViewport, sameGrid, type Grid } from "@/lib/board";
import { bindKeyboard } from "@/lib/input";
import { GameSocket } from "@/lib/websocket";
import type { ClientMessage, ConnectionStatus, GameState } from "@/types/game";

const DEFAULT_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:8000/ws";

/** A window drag fires continuously; only the size it settles on is worth sending. */
const RESIZE_DEBOUNCE_MS = 250;

export function useSnakeGame(url: string = DEFAULT_URL) {
  const [state, setState] = useState<GameState | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const socketRef = useRef<GameSocket | null>(null);

  useEffect(() => {
    const socket = new GameSocket(url, {
      onState: setState,
      onStatusChange: setConnection,
    });
    socketRef.current = socket;
    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [url]);

  const send = useCallback((message: ClientMessage) => {
    socketRef.current?.send(message);
  }, []);

  useEffect(() => bindKeyboard(send), [send]);

  // The board fills the screen, so the server cannot know its shape until we
  // measure it. Runs on every fresh connection: a reconnect gets a new `Game`
  // back on the default board, which would otherwise not fill the window.
  useEffect(() => {
    if (connection !== "open") return;

    let sent: Grid | null = null;
    const push = () => {
      const grid = gridForViewport(window.innerWidth, window.innerHeight);
      // Resizing restarts the run, so never send a size the server already has.
      if (sent && sameGrid(sent, grid)) return;
      sent = grid;
      send({ type: "resize", width: grid.cols, height: grid.rows });
    };

    push();

    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(push, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, [connection, send]);

  return { state, connection, send };
}
