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
 * Five hues that stay apart from each other, but the colour is never the only
 * cue: every snake carries a black outline so it reads against any of the eight
 * backgrounds above, the player's own snake wears a white ring on its head, and
 * the side panel lists everyone by name and number. Somebody who cannot tell
 * the red from the green can still tell the snakes apart.
 */
export const PLAYER_COLORS: readonly string[] = [
  "#F5001E",
  "#22DFF5",
  "#FFE93D",
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
