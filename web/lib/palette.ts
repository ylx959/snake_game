/**
 * The colour pairs the board cycles through.
 *
 * The server never sends a colour - it sends `palette`, an index - so a hue can
 * be retuned here without touching the backend or dropping a player's game.
 * Keep the length in step with `PALETTE_COUNT` in backend/game/game.py.
 */

export interface Palette {
  /** Fills the whole screen. */
  bg: string;
  /** The snake. */
  fg: string;
}

export const PALETTES: readonly Palette[] = [
  { bg: "#00D6F0", fg: "#F5001E" },
  { bg: "#FF4A1F", fg: "#22DFF5" },
  { bg: "#12B0EF", fg: "#F03A1E" },
  { bg: "#4B2BEE", fg: "#FFE93D" },
  { bg: "#FF1B5E", fg: "#3EE03E" },
  { bg: "#7bf53a", fg: "#FF0CBA" },
  { bg: "#40FFAB", fg: "#FF0028"},
  { bg: "#FFE93D", fg: "#4B2BEE" },
];

/**
 * Text, borders, eyes - and the apple. Black on every pair, exactly as in the
 * reference art.
 *
 * The apple was going to wear the *next* pair's foreground, as a hint at the
 * world the next bite brings. The palette will not have it: consecutive pairs
 * share a hue, so a cyan apple landed on a cyan board more often than not.
 * Black is the one colour legible on every background here, and it is already
 * on the board anyway.
 */
export const INK = "#000000";

/**
 * One colour per player in a room, by the `color` index the server handed out.
 *
 * Chosen for the **white board** a room is now played on, so all five are
 * *dark*: against white, luminance is what makes a colour visible at all, and
 * hue is what tells the five apart. They are the same five hues the board has
 * always used - red, cyan, yellow, green, magenta - deepened until each one
 * carries at least 4.5:1 against the ground it lies on.
 *
 * The bright originals were picked for a black board and do not survive the
 * move: `#FFE93D` on white is 1.24:1 and `#3EE03E` is 1.76:1, which is not a
 * hard-to-read snake but an invisible one. `test/palette.test.mjs` measures
 * both the contrast and the distance between the five, so a retune that makes
 * one vanish or two alike fails the build.
 *
 * Colour is never the only cue. Your own snake carries a name tag on its head,
 * and the roster in the corner numbers and names everyone, so a player who
 * cannot separate the red from the green still can.
 */
export const PLAYER_COLORS: readonly string[] = [
  "#22DFF5",
  "#4B2BEE",
  "#FF4A1F",
  "#3EE03E",
  "#FF0CBA",
];

/** Tolerates an out-of-range index rather than rendering `undefined`. */
export function paletteAt(index: number): Palette {
  const n = PALETTES.length;
  return PALETTES[((index % n) + n) % n];
}

/** The same tolerance for a player colour. */
export function playerColorAt(index: number): string {
  const n = PLAYER_COLORS.length;
  return PLAYER_COLORS[((index % n) + n) % n];
}



/** The white the snake lights text with, and the ring on your own head. */
export const PAPER = "#FFFFFF";

/**
 * The flat colours the **menu** cycles through, and which way round the type
 * goes on each.
 *
 * Deliberately its own list rather than a second use of `PLAYER_COLORS`, even
 * though five of the six are the same hexes today. Those five are pinned by
 * `test/palette.test.mjs` against the *white* board a room is played on - at
 * least 4.5:1 on it, at least ΔE 40 apart - and a retune for that is a retune
 * for a different job. Here the colour *is* the ground, and nothing has to be
 * told apart from anything.
 *
 * Each entry owns three independent facts: the ground the screen stands on, the
 * measured ink the type on that ground takes, and the colour the mascot wears
 * in front of it. They do not derive from one another.
 *
 * `ink` is measured, not guessed. Five of the six are bright enough to carry
 * black type (#FFE93D 17.0:1, #22DFF5 12.9:1, #3EE03E 11.9:1, #FF4A1F 6.2:1,
 * #FF0CBA 6.0:1); #4B2BEE is not (2.9:1 against black, 7.3:1 against white), so
 * it is the one that turns over. Retuning a hex here means re-checking its
 * pair - a menu colour is the ground a whole screen of type sits on, and there
 * is nothing else on that screen to fall back to.
 *
 * `creature` is borrowed from the Solo pair lineage: the head is a *flat shape*
 * on the ground rather than type on it, so it is picked for contrast of hue
 * against `bg` - the ground's own opposite, not its ink. Its eyes stay literal
 * white in every pair, which is what keeps the face a face on all six.
 * The exact six pairs are pinned by `test/palette.test.mjs`.
 */
export interface MenuColor {
  /** Fills the stage. */
  bg: string;
  /** Fills the favicon creature's head; its eyes remain literal white. */
  creature: string;
  /** `"white"` only where the ground is too dark for black. */
  ink: "black" | "white";
}

export const MENU_COLORS: readonly MenuColor[] = [
  { bg: "#22DFF5", creature: "#FF4A1F", ink: "black" },
  { bg: "#4B2BEE", creature: "#FFE93D", ink: "white" },
  { bg: "#FF4A1F", creature: "#22DFF5", ink: "black" },
  { bg: "#3EE03E", creature: "#FF1B5E", ink: "black" },
  { bg: "#FF0CBA", creature: "#7BF53A", ink: "black" },
  { bg: "#FFE93D", creature: "#4B2BEE", ink: "black" },
];

/** The same out-of-range tolerance the two lists above get. */
export function menuColorAt(index: number): MenuColor {
  const n = MENU_COLORS.length;
  return MENU_COLORS[((index % n) + n) % n];
}
