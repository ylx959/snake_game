"use client";

/**
 * The seam between React and the framework-free game modules.
 *
 * Owns the socket lifecycle, mirrors server state into React state, and wires
 * the keyboard. Nothing in `lib/` imports React; everything React-shaped lives
 * here.
 *
 * It says nothing about size. The board's shape is the server's - the window
 * only decides how large to draw it - so resizing never reaches the socket and
 * can never end a run.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { bindKeyboard } from "@/lib/input";
import { GameSocket } from "@/lib/websocket";
import type { ClientMessage, ConnectionStatus, GameState } from "@/types/game";

const DEFAULT_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:8000/ws";

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

  return { state, connection, send };
}
