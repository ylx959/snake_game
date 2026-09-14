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

/**
 * The name this key press goes by here: `w`, `r`, `space`, `ArrowUp`.
 *
 * It reads `event.code` - the key's *position* on the keyboard - in preference
 * to `event.key`, which is the character the key currently produces. The two
 * disagree more often than you would think: an input method can hand over
 * `"Process"` instead of the letter, a dead key can produce nothing at all, and
 * on a non-QWERTY layout `event.key` for the key under your left middle finger
 * is not `w`. Position is what WASD means, and it is what R and Space mean too.
 *
 * `event.key` stays as the fallback, for anything that reports no `code`.
 */
function keyName(event: KeyboardEvent): string {
  const { code } = event;
  if (code.startsWith("Arrow")) return code; // ArrowUp, and same as `key`
  if (code.startsWith("Key")) return code.slice(3).toLowerCase(); // KeyR -> r
  if (code === "Space") return "space";
  if (code) return code;
  return event.key === " " ? "space" : event.key.toLowerCase();
}

/**
 * True while the key press belongs to something the player is typing into.
 *
 * This guard is load-bearing now that the site has forms. The handler below
 * cancels Space and R unconditionally - it has to, or a focused button steals
 * Space - and a blanket cancel over a nickname field would eat the space bar
 * and swallow the letter R. So typing is checked first, and a key aimed at an
 * input is left entirely alone: not steered with, not cancelled, not routed to
 * a button.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** The button that claims a key, or null. */
function buttonFor(name: string): HTMLButtonElement | null {
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
    if (isTyping(event.target)) return;
    const name = keyName(event as KeyboardEvent);

    const direction = KEY_TO_DIRECTION[name];
    if (direction) {
      event.preventDefault(); // stop arrow keys scrolling the page
      send({ type: "turn", direction });
      return;
    }

    const button = buttonFor(name);
    if (!button) return;

    // Always cancel, even for a disabled button: Space is a button key, so
    // without this the browser hands it to whichever button last had focus and
    // the hint starts lying - click Reset once and Space would reset from then
    // on. A button fires its click on Space *keyup*, so cancelling the keydown
    // is what stops it. Enter is left alone, so a focused button still answers
    // it and the controls stay reachable by keyboard alone.
    event.preventDefault();
    if ((event as KeyboardEvent).repeat || button.disabled) return;

    button.dataset.pressed = "";
    button.click();
  };

  const up = (event: Event) => {
    if (isTyping(event.target)) return;
    const button = buttonFor(keyName(event as KeyboardEvent));
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
