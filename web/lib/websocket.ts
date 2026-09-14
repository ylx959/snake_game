/**
 * WebSocket client. Plain TypeScript, no React - React talks to it through
 * `useGameSession`, so the transport stays testable and framework-free.
 *
 * It knows nothing about what any message means. Every frame goes to one
 * handler; deciding what a `lobby_state` or a `results` does to the screen is
 * the hook's job, not the socket's.
 */

import type { ClientMessage, ConnectionStatus, ServerMessage } from "@/types/game";

export interface GameSocketHandlers {
  onMessage?: (message: ServerMessage) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

const RECONNECT_DELAY_MS = 1000;

export class GameSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUs = false;

  constructor(
    private readonly url: string,
    private readonly handlers: GameSocketHandlers = {},
  ) {}

  connect(): void {
    this.closedByUs = false;
    this.handlers.onStatusChange?.("connecting");

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => this.handlers.onStatusChange?.("open");

    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return; // a frame we cannot read is not worth taking the socket down for
      }
      this.handlers.onMessage?.(message);
    };

    socket.onclose = () => {
      this.handlers.onStatusChange?.("closed");
      // The backend holds the game state, so a drop loses the run and the room.
      // Reconnect anyway - a fresh menu beats a dead page.
      if (!this.closedByUs) {
        this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      }
    };

    socket.onerror = () => socket.close();
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /** Drop the socket and stop trying to get it back. */
  disconnect(): void {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}
