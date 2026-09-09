/**
 * WebSocket client. Plain TypeScript, no React - React talks to it through
 * `useSnakeGame`, so the transport stays testable and framework-free.
 */

import type { ClientMessage, ConnectionStatus, ServerMessage } from "@/types/game";

export interface GameSocketHandlers {
  onState?: (state: ServerMessage) => void;
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
      const message = JSON.parse(event.data as string) as ServerMessage;
      if (message.type === "state") this.handlers.onState?.(message);
    };

    socket.onclose = () => {
      this.handlers.onStatusChange?.("closed");
      // The backend holds the game state, so a drop loses the run. Reconnect
      // anyway - a fresh board beats a dead page.
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

  disconnect(): void {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}
