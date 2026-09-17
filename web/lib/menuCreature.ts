/**
 * The maths behind the menu mascot: where it looks, how it gets there, when it
 * blinks. Framework-free and DOM-free; the clock lives in MenuCreature.tsx.
 */

export interface CreatureAim {
  /** -1 at the window's left edge, 0 on the mascot, 1 at the right. */
  x: number;
  /** -1 at the top, 0 on the mascot, 1 at the bottom. */
  y: number;
}

export interface CreaturePose {
  /** SVG units, in the head's own 54-unit box. */
  headX: number;
  headY: number;
  /** Degrees, about the head's centre. */
  headRotation: number;
  /** SVG units, on top of the head's own move. */
  eyeX: number;
  eyeY: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** Straight ahead: a fresh mount, and a pointer that has left. */
export const neutralAim = (): CreatureAim => ({ x: 0, y: 0 });

/**
 * A pointer position, as an aim. Absolute, so a still pointer keeps the gaze.
 * `null` for geometry that cannot mean anything - a NaN let into the smoothing
 * would stay there for the life of the page, since every frame mixes against it.
 */
export function normalizeCreatureAim(
  pointerX: number,
  pointerY: number,
  centerX: number,
  centerY: number,
  halfViewportWidth: number,
  halfViewportHeight: number,
): CreatureAim | null {
  const values = [pointerX, pointerY, centerX, centerY, halfViewportWidth, halfViewportHeight];
  if (!values.every(Number.isFinite) || halfViewportWidth <= 0 || halfViewportHeight <= 0) {
    return null;
  }
  return {
    x: clamp((pointerX - centerX) / halfViewportWidth, -1, 1),
    y: clamp((pointerY - centerY) / halfViewportHeight, -1, 1),
  };
}

/** How fast the gaze closes on the pointer: 1/e of the way per 1/11s. */
const FOLLOW_RATE = 11;

/**
 * The ends of the travel, in the 54-unit box the favicon is drawn in. The head
 * leans about 3% of its own width; the eyes go twice that, so the gaze reads
 * first, and both stay inside the black silhouette at full deflection.
 */
const HEAD_X = 1.8;
const HEAD_Y = 1.35;
const HEAD_ROTATION = 3.2;
const EYE_X = 3.6;
const EYE_Y = 2.7;

/** Once every 4.2s, shut and open again inside 160ms. */
const BLINK_PERIOD = 4.2;
const BLINK_DURATION = 0.16;

/**
 * One frame of easing. `1 - e^(-rate·dt)` composes, so two 60fps frames land
 * where one 30fps frame does. `dt` is capped because a backgrounded tab hands
 * back one enormous delta, which would snap the head round on the way back.
 */
export function approachCreatureAim(
  current: CreatureAim,
  target: CreatureAim,
  deltaSeconds: number,
): CreatureAim {
  const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.064);
  const mix = 1 - Math.exp(-FOLLOW_RATE * dt);
  return {
    x: current.x + (target.x - current.x) * mix,
    y: current.y + (target.y - current.y) * mix,
  };
}

/**
 * An aim, as the transforms the SVG wears. Clamped again rather than trusting
 * the caller: last chance before a number becomes a live attribute.
 */
export function creaturePose(aim: CreatureAim): CreaturePose {
  const x = clamp(Number.isFinite(aim.x) ? aim.x : 0, -1, 1);
  const y = clamp(Number.isFinite(aim.y) ? aim.y : 0, -1, 1);
  return {
    headX: x * HEAD_X,
    headY: y * HEAD_Y,
    headRotation: x * HEAD_ROTATION,
    eyeX: x * EYE_X,
    eyeY: y * EYE_Y,
  };
}

/**
 * How open the eyes are, 1 wide and 0.08 shut. Pure, so there is no timer to
 * leak. The triangle lands back on exactly 1, so no blink leaves the eyes part
 * closed - and never on 0, which would read as a glitch rather than a blink.
 */
export function blinkScaleAt(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 1;
  const phase = seconds % BLINK_PERIOD;
  if (phase < BLINK_PERIOD - BLINK_DURATION) return 1;
  const progress = (phase - (BLINK_PERIOD - BLINK_DURATION)) / BLINK_DURATION;
  return Math.max(0.08, Math.abs(progress * 2 - 1));
}
