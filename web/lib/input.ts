/**
 * Keyboard input. Turns key presses into `ClientMessage`s and hands them to a
 * sink - it never touches the socket or the DOM beyond the listener.
 */

import type { ClientMessage, Direction } from "@/types/game";

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  w: "UP",
  s: "DOWN",
  a: "LEFT",
  d: "RIGHT",
};

export function keyToMessage(key: string): ClientMessage | null {
  const direction = KEY_TO_DIRECTION[key] ?? KEY_TO_DIRECTION[key.toLowerCase()];
  if (direction) return { type: "turn", direction };
  if (key === " ") return { type: "pause" };
  if (key.toLowerCase() === "r") return { type: "reset" };
  return null;
}

/** Binds the listener and returns the unbind function. */
export function bindKeyboard(
  send: (message: ClientMessage) => void,
  target: Window | HTMLElement = window,
): () => void {
  const handle = (event: Event) => {
    const message = keyToMessage((event as KeyboardEvent).key);
    if (!message) return;
    event.preventDefault(); // stop arrow keys scrolling the page
    send(message);
  };

  target.addEventListener("keydown", handle);
  return () => target.removeEventListener("keydown", handle);
}
