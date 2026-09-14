import assert from "node:assert/strict";
import test from "node:test";

import {
  INK,
  PAPER,
  PALETTES,
  PLAYER_COLORS,
  ROOM_BACKGROUNDS,
  inkOn,
  roomBackgroundAt,
} from "../lib/palette.ts";

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

/**
 * Comfortably past "not the same colour" and past "not a near-miss" too: at
 * this distance two colours are not in the same family, let alone confusable
 * with a snake moving eight cells a second across them.
 */
const CLEARLY_DIFFERENT = 40;

test("the eye-distance helper agrees with the eye on a known near-miss", () => {
  // The pair that started this: the old room background against the player
  // colour it sat under. Numerically far apart, visually the same cyan.
  assert.ok(difference("#00D6F0", "#22DFF5") < 5);
  assert.equal(difference("#FFE93D", "#FFE93D"), 0);
  // And a pair nobody would confuse, to show the scale is not just small.
  assert.ok(difference("#000000", "#FFFFFF") > 90);
});

test("no room background is the same colour as a player, or near one", () => {
  let closest = { distance: Infinity };

  for (const background of ROOM_BACKGROUNDS) {
    for (const player of PLAYER_COLORS) {
      const distance = difference(background, player);
      if (distance < closest.distance) closest = { distance, background, player };
    }
  }

  assert.ok(
    closest.distance >= CLEARLY_DIFFERENT,
    `${closest.background} is only ${closest.distance.toFixed(1)} from ${closest.player}`,
  );
});

test("the solo palette is exactly why rooms needed their own list", () => {
  // Not a rule being enforced - a fact being recorded. These eight are right
  // for the one snake that changes colour with them, and wrong under five that
  // cannot. If this ever stops failing, the two lists could merge again.
  const collisions = PALETTES.filter((palette) =>
    PLAYER_COLORS.some((player) => difference(palette.bg, player) < CLEARLY_DIFFERENT),
  );
  assert.ok(collisions.length > 0);
});

test("a death visibly changes the room's colour", () => {
  // Consecutive, and wrapping: the palette advances by one per death, so every
  // step anyone can see has to look like a step.
  for (let index = 0; index < ROOM_BACKGROUNDS.length; index += 1) {
    const here = roomBackgroundAt(index);
    const next = roomBackgroundAt(index + 1);
    const distance = difference(here, next);
    assert.ok(distance >= CLEARLY_DIFFERENT, `${here} -> ${next} is only ${distance.toFixed(1)}`);
  }
});

test("room backgrounds are dark enough to carry white type and a white wall", () => {
  for (const background of ROOM_BACKGROUNDS) {
    assert.equal(inkOn(background), PAPER, `${background} needs a dark ground`);
  }
});

test("room backgrounds are bright enough for the spotlight to show on them", () => {
  // The light is only as visible as the difference between lit ground and the
  // same ground under the veil, so a ground can be too dark to light up. Solo's
  // dimmest pair manages about 35 and reads fine; a first pass at this list sat
  // around 15 and the spotlight all but vanished.
  const veiled = (hex) => {
    const packed = Number.parseInt(hex.slice(1), 16);
    const dim = (shift) => Math.round(((packed >> shift) & 255) * (1 - 0.9));
    return `#${[16, 8, 0].map((s) => dim(s).toString(16).padStart(2, "0")).join("")}`;
  };

  for (const background of ROOM_BACKGROUNDS) {
    const gap = lab(background)[0] - lab(veiled(background))[0];
    assert.ok(gap >= 35, `${background} only lifts ${gap.toFixed(1)} out of its own shadow`);
  }
});

test("a room's apple inverts with its ground", () => {
  // Solo is not asked: its apple is black on all eight palettes and always has
  // been, which is a decision about the art rather than about contrast. This
  // rule exists so a room's deep grounds can never end up with a black apple
  // on them.
  for (const background of ROOM_BACKGROUNDS) assert.equal(inkOn(background), PAPER);
  assert.equal(inkOn("#FFFFFF"), INK);
});

test("an out-of-range index still returns a colour", () => {
  assert.equal(roomBackgroundAt(ROOM_BACKGROUNDS.length), ROOM_BACKGROUNDS[0]);
  assert.equal(roomBackgroundAt(-1), ROOM_BACKGROUNDS[ROOM_BACKGROUNDS.length - 1]);
});
