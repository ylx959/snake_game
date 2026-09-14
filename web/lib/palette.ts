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
 * Chosen for a **black board**, so all five are bright: against black,
 * luminance is what makes a colour visible at all, and hue is what tells the
 * five apart.
 *
 * Colour is never the only cue. Your own snake carries a name tag on its head,
 * and the roster in the corner numbers and names everyone, so a player who
 * cannot separate the red from the green still can.
 */
export const PLAYER_COLORS: readonly string[] = [
  "#F5001E",
  "#22DFF5",
  "#FFE93D",
  "#3EE03E",
  "#FF0CBA",
];

/**
 * The backgrounds a **room** cycles through, one step per death.
 *
 * A separate list from `PALETTES`, and it has to be. Those eight were chosen to
 * sit under a single snake whose colour moves with them; a room has five snakes
 * whose colours cannot move, because a colour is which player you are. Reusing
 * them put `#FFE93D` under the player already wearing `#FFE93D` - the same
 * colour, not merely a close one - and cyan under cyan at a distance below what
 * the eye can resolve at all.
 *
 * So these are their own eight, and three things are true of every one of them.
 *
 * **Far from all five player colours**: the closest pair is ΔE 46 in CIE Lab,
 * where the eye needs roughly 2 to tell two colours apart at all.
 *
 * **Bright enough to be lit.** The spotlight is only as visible as the
 * difference between lit ground and the same ground under 90% black, and a
 * first attempt at this list went too dark - deep navies that were safely clear
 * of every snake and had nothing left for the light to pick out. These sit at
 * L 40-48, so that gap is 38-45, which is what solo gets from its own darkest
 * pair. Dark enough, still, for white type and a white wall to read over them.
 *
 * **Far from each other**, in this order: consecutive entries are ΔE 64 apart
 * at the closest. A death is supposed to be *felt*, and two neighbouring browns
 * would make it look like nothing happened.
 *
 * `test/palette.test.mjs` measures all three rather than trusting the list, so
 * a retuned hue that collides or goes dim fails the build.
 */
export const ROOM_BACKGROUNDS: readonly string[] = [
  "#8A5337",
  "#227A25",
  "#2B6699",
  "#996917",
  "#006B68",
  "#993D71",
  "#5D6B00",
  "#8D3D99",
];

/**
 * Black on a light ground, white on a dark one.
 *
 * The apple is drawn in whichever reads: solo grounds are bright, so it is
 * black there exactly as it always was, and a room's are deep, so it is white -
 * the same rule that used to be written out twice, once per mode.
 */
export function inkOn(background: string): string {
  const packed = Number.parseInt(background.slice(1), 16);
  const r = ((packed >> 16) & 255) / 255;
  const g = ((packed >> 8) & 255) / 255;
  const b = (packed & 255) / 255;
  // Rec. 709 luma. Good enough to answer "is this light or dark"; nothing here
  // needs the full sRGB-to-linear round trip.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? INK : PAPER;
}

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

/** And for a room's background. */
export function roomBackgroundAt(index: number): string {
  const n = ROOM_BACKGROUNDS.length;
  return ROOM_BACKGROUNDS[((index % n) + n) % n];
}

/** The white the snake lights text with, and the ring on your own head. */
export const PAPER = "#FFFFFF";
