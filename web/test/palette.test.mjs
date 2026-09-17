import assert from "node:assert/strict";
import test from "node:test";

import { MENU_COLORS, PAPER, PALETTES, PLAYER_COLORS, ROOM_GROUND } from "../lib/palette.ts";

/**
 * CIE Lab, so "are these two colours alike?" is asked the way an eye asks it.
 *
 * RGB distance is the wrong question: `#00D6F0` and `#22DFF5` are far apart as
 * numbers and the same colour to look at. This lives in the test rather than in
 * `lib/` because nothing the game draws needs it - it is here to hold the
 * palette to a promise, not to pick a colour at runtime.
 */
function lab(hex) {
  const packed = Number.parseInt(hex.slice(1), 16);
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = toLinear(((packed >> 16) & 255) / 255);
  const g = toLinear(((packed >> 8) & 255) / 255);
  const b = toLinear((packed & 255) / 255);

  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76. Around 2.3 is the smallest difference an eye can see at all. */
function difference(first, second) {
  const [a, b] = [lab(first), lab(second)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Relative luminance, for the contrast ratio below. */
function luminance(hex) {
  const packed = Number.parseInt(hex.slice(1), 16);
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = toLinear(((packed >> 16) & 255) / 255);
  const g = toLinear(((packed >> 8) & 255) / 255);
  const b = toLinear((packed & 255) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first, second) {
  const [a, b] = [luminance(first), luminance(second)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** A snake this far off the ground is a shape, not a smudge. */
const READABLE = 4.5;

/** Past "not the same colour", and past "not a near-miss" too. */
const CLEARLY_DIFFERENT = 40;

test("the eye-distance helper agrees with the eye on a known near-miss", () => {
  // Numerically far apart, visually the same cyan.
  assert.ok(difference("#00D6F0", "#22DFF5") < 5);
  assert.equal(difference("#FFE93D", "#FFE93D"), 0);
  // And a pair nobody would confuse, to show the scale is not just small.
  assert.ok(difference("#000000", "#FFFFFF") > 90);
});

test("every player colour reads on the board it is played on", () => {
  // Against `ROOM_GROUND`, not `PAPER`: the board is the light grey, and the
  // five are chosen against the thing they actually lie on.
  let worst = { ratio: Infinity };

  for (const player of PLAYER_COLORS) {
    const ratio = contrast(player, ROOM_GROUND);
    if (ratio < worst.ratio) worst = { ratio, player };
  }

  assert.ok(
    worst.ratio >= READABLE,
    `${worst.player} is only ${worst.ratio.toFixed(2)}:1 against the board`,
  );
});

test("the old bright colours are exactly why they had to be retuned", () => {
  // Not a rule being enforced - a fact being recorded. These five were chosen
  // for a black board, where luminance is what made them visible; on white the
  // same property makes three of them disappear.
  const chosenForBlack = ["#F5001E", "#22DFF5", "#FFE93D", "#3EE03E", "#FF0CBA"];
  const vanishing = chosenForBlack.filter((hex) => contrast(hex, PAPER) < 2);

  assert.deepEqual(vanishing, ["#22DFF5", "#FFE93D", "#3EE03E"]);
  assert.ok(contrast("#FFE93D", PAPER) < 1.3, "yellow on white is barely a colour at all");
});

test("no two players wear the same colour, or near it", () => {
  let closest = { distance: Infinity };

  for (let i = 0; i < PLAYER_COLORS.length; i += 1) {
    for (let j = i + 1; j < PLAYER_COLORS.length; j += 1) {
      const distance = difference(PLAYER_COLORS[i], PLAYER_COLORS[j]);
      if (distance < closest.distance) {
        closest = { distance, a: PLAYER_COLORS[i], b: PLAYER_COLORS[j] };
      }
    }
  }

  assert.ok(
    closest.distance >= CLEARLY_DIFFERENT,
    `${closest.a} and ${closest.b} are only ${closest.distance.toFixed(1)} apart`,
  );
});

test("there is a colour for every player a room can hold", () => {
  // `MAX_PLAYERS` in backend/room/room.py. The server hands out an index and
  // trusts this list to have one for it.
  assert.equal(PLAYER_COLORS.length, 5);
});

test("the solo palette is untouched", () => {
  // A room going white says nothing about solo, which still cycles all eight
  // pairs on its own apples.
  assert.equal(PALETTES.length, 8);
  assert.equal(PALETTES[0].bg, "#00D6F0");
});

test("each menu ground carries its approved Solo-style creature colour", () => {
  assert.deepEqual(
    MENU_COLORS.map(({ bg, creature }) => [bg, creature]),
    [
      ["#22DFF5", "#FF4A1F"],
      ["#4B2BEE", "#FFE93D"],
      ["#FF4A1F", "#22DFF5"],
      ["#3EE03E", "#FF1B5E"],
      ["#FF0CBA", "#7BF53A"],
      ["#FFE93D", "#4B2BEE"],
    ],
  );
});
