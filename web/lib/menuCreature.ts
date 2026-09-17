/**
 * The maths behind the menu mascot: where it is looking, how it gets there, and
 * when it blinks.
 *
 * Framework-free and DOM-free on purpose, exactly like the rest of `lib/`. The
 * browser clock and the pointer live in `components/ui/MenuCreature.tsx`; every
 * number that ends up on the SVG is computed here, from arguments alone, so a
 * pose is testable without a window and cannot drift between renders.
 *
 * The whole model is two stages. A pointer position becomes an *aim* - the
 * signed unit vector from the mascot to the pointer, clamped to the viewport -
 * and an aim becomes a *pose*, the handful of transforms the SVG actually
 * wears. Smoothing happens between the two, on the aim, so the head, the
 * rotation and the eyes can never disagree about where the creature is looking:
 * they are three readings of one number.
 */

export interface CreatureAim {
  /** -1 at the left edge of the window, 0 on the mascot, 1 at the right. */
  x: number;
  /** -1 at the top edge, 0 on the mascot, 1 at the bottom. */
  y: number;
}

export interface CreaturePose {
  /** SVG units the head slides, in the head's own 54-unit box. */
  headX: number;
  headY: number;
  /** Degrees the head tips, about its own centre. */
  headRotation: number;
  /** SVG units the eyes slide *on top of* the head's own move. */
  eyeX: number;
  eyeY: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** Looking straight ahead - the pose a fresh mount and a departed pointer wear. */
export const neutralAim = (): CreatureAim => ({ x: 0, y: 0 });

/**
 * A pointer position, as an aim.
 *
 * Absolute on both axes, never a delta: the aim is a *place*, so a pointer that
 * stops moving leaves the creature looking at it rather than sliding back on
 * its own. The halves are the viewport's, not the mascot's, so the far edge of
 * the window is full deflection however small the mascot is drawn.
 *
 * Returns `null` rather than a pose for geometry that cannot mean anything - a
 * zero-sized box before layout has happened, a NaN out of a rect read mid
 * teardown. A rejected reading leaves the last good aim in place; a NaN allowed
 * into the smoothing would stay there for the life of the page, because every
 * later frame mixes against it.
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

/** How fast the gaze closes on the pointer. Higher is snappier, 1/e per 1/11s. */
const FOLLOW_RATE = 11;

/**
 * The head's whole travel, in the 54-unit box the favicon is drawn in - about
 * 3% of its own width each way, which is a lean rather than a move. The eyes
 * travel twice that, and the rotation is small enough to read as weight
 * shifting rather than as the square being spun.
 */
const HEAD_X = 1.8;
const HEAD_Y = 1.35;
const HEAD_ROTATION = 3.2;
const EYE_X = 3.6;
const EYE_Y = 2.7;

/** Once every 4.2s, for 160ms - shut and open again inside a fifth of a second. */
const BLINK_PERIOD = 4.2;
const BLINK_DURATION = 0.16;

/**
 * One frame of easing toward the target.
 *
 * Exponential, not a fixed fraction per frame: `1 - e^(-rate·dt)` composes, so
 * two 60fps frames land exactly where one 30fps frame does and the creature
 * follows at the same speed on every display. A per-frame lerp would make the
 * gaze twice as fast on a 120Hz screen.
 *
 * `dt` is clamped at 64ms. A tab that was backgrounded hands back one enormous
 * delta on its first frame, and without the ceiling the mascot would snap to
 * the pointer the instant the tab is looked at again instead of turning to it.
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
 * An aim, as the transforms the SVG wears.
 *
 * The eyes move farther than the head and in the same direction, which is what
 * makes the gaze read first: a viewer sees the eyes arrive and the head follow,
 * the way a head turn actually happens. Both limits are small enough that the
 * eyes stay inside the black silhouette at full deflection - they slide within
 * the face, they do not leave it.
 *
 * Clamped again rather than trusting the caller: this is the last place a
 * number can be caught before it becomes an attribute on a live element.
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
 * How open the eyes are at a given moment, 1 wide and 0.08 shut.
 *
 * A pure function of elapsed seconds rather than a piece of state a timer
 * advances: there is nothing to reset, nothing to leak, and the same second
 * always gives the same answer, which is what lets a test pin it. The triangle
 * - `|2p - 1|` across the window - shuts and reopens at one speed, and lands
 * back on exactly 1 at the end, so no blink can leave the eyes part closed.
 *
 * Never fully 0: a capsule scaled to nothing disappears, and a face that loses
 * its eyes for a frame reads as a glitch rather than as a blink.
 */
export function blinkScaleAt(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 1;
  const phase = seconds % BLINK_PERIOD;
  if (phase < BLINK_PERIOD - BLINK_DURATION) return 1;
  const progress = (phase - (BLINK_PERIOD - BLINK_DURATION)) / BLINK_DURATION;
  return Math.max(0.08, Math.abs(progress * 2 - 1));
}
