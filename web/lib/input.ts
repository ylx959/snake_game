/**
 * Keyboard input.
 *
 * Two kinds of key, handled differently on purpose:
 *
 * - **Steering** (arrows / WASD) has no button on screen, so it turns straight
 *   into a `ClientMessage` and goes to the sink.
 * - **Space and R** belong to the buttons. The key does not send a command of
 *   its own - it finds the button that claims it (`data-key`) and clicks it,
 *   so the keyboard and the mouse go down exactly the same path. The button is
 *   the single definition of what the command is, which is what keeps Space
 *   honest: it means Start or Pause depending on the label you can see, and it
 *   does nothing while the button is disabled.
 *
 * The button also lights up while the key is held, so a key press looks like
 * what it is - see `data-pressed` in globals.css.
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

export function keyToDirection(key: string): Direction | null {
  return KEY_TO_DIRECTION[key] ?? KEY_TO_DIRECTION[key.toLowerCase()] ?? null;
}

/**
 * The button that claims a key, or null. Space is spelled `space` rather than
 * a literal " ", which no attribute selector would survive.
 */
function buttonFor(key: string): HTMLButtonElement | null {
  const name = key === " " ? "space" : key.toLowerCase();
  return document.querySelector<HTMLButtonElement>(`button[data-key="${name}"]`);
}

/** Let go of every button the keyboard is holding down. */
function releaseAll(): void {
  for (const button of document.querySelectorAll<HTMLElement>("button[data-pressed]")) {
    delete button.dataset.pressed;
  }
}

/** Binds the listeners and returns the unbind function. */
export function bindKeyboard(
  send: (message: ClientMessage) => void,
  target: Window | HTMLElement = window,
): () => void {
  const down = (event: Event) => {
    const { key, repeat } = event as KeyboardEvent;

    const direction = keyToDirection(key);
    if (direction) {
      event.preventDefault(); // stop arrow keys scrolling the page
      send({ type: "turn", direction });
      return;
    }

    const button = buttonFor(key);
    if (!button) return;

    // Always cancel, even for a disabled button: Space is a button key, so
    // without this the browser hands it to whichever button last had focus and
    // the hint starts lying - click Reset once and Space would reset from then
    // on. A button fires its click on Space *keyup*, so cancelling the keydown
    // is what stops it. Enter is left alone, so a focused button still answers
    // it and the controls stay reachable by keyboard alone.
    event.preventDefault();
    if (repeat || button.disabled) return;

    button.dataset.pressed = "";
    button.click();
  };

  const up = (event: Event) => {
    const button = buttonFor((event as KeyboardEvent).key);
    if (button) delete button.dataset.pressed;
  };

  target.addEventListener("keydown", down);
  target.addEventListener("keyup", up);
  // A key held while the window loses focus never delivers its keyup, and the
  // button would stay stuck in the pressed look.
  window.addEventListener("blur", releaseAll);

  return () => {
    target.removeEventListener("keydown", down);
    target.removeEventListener("keyup", up);
    window.removeEventListener("blur", releaseAll);
    releaseAll();
  };
}
