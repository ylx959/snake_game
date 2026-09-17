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

export interface ShakePose {
  /** SVG units applied to the outer group. */
  x: number;
  /** Degrees about the favicon's 27,27 centre. */
  rotation: number;
}

/** What the face is saying. Ranked: angry beats tired beats neutral. */
export type CreatureExpressionId = "neutral" | "tired" | "angry";

export interface EyeShape {
  width: number;
  height: number;
  /** SVG degrees about this eye's own centre; positive turns clockwise. */
  rotation: number;
}

export interface EyeExpressionPose {
  left: EyeShape;
  right: EyeShape;
}

/**
 * How long one activation runs, whatever the pointer does. The caller starts a
 * clock and samples it; the length is stated here so the component never has to
 * agree with a stylesheet about when the run is over.
 */
export const SHAKE_DURATION_SECONDS = 1.5;

/** Nine there-and-backs, and the ends of the travel in the 54-unit box. */
const SHAKE_CYCLES = 9;
const SHAKE_X = 3.2;
const SHAKE_ROTATION = 4.5;
const neutralShake = (): ShakePose => ({ x: 0, rotation: 0 });

/**
 * One frame of the shake, from the run's own elapsed seconds.
 *
 * The half-sine envelope is what makes the body leave and return to neutral
 * without a jump at either end: outside the run - before it, after it, or with
 * a time that means nothing - the pose is exactly neutral, so a caller that
 * samples late writes the same transform it started with.
 *
 * Reduced motion keeps the run and drops only the movement: the caller still
 * holds a busy button for 1.5s and still advances the colour once, because the
 * colour change is the point and the shaking is the decoration.
 */
export function shakePoseAt(localSeconds: number, reducedMotion = false): ShakePose {
  if (
    reducedMotion ||
    !Number.isFinite(localSeconds) ||
    localSeconds <= 0 ||
    localSeconds >= SHAKE_DURATION_SECONDS
  ) {
    return neutralShake();
  }

  const progress = localSeconds / SHAKE_DURATION_SECONDS;
  const envelope = Math.sin(Math.PI * progress);
  const wave = Math.sin(progress * Math.PI * 2 * SHAKE_CYCLES);
  return {
    x: SHAKE_X * envelope * wave,
    rotation: SHAKE_ROTATION * envelope * wave,
  };
}

/** The one boundary the colour change hangs off. Never true for a bad time. */
export function shakeCompleteAt(localSeconds: number): boolean {
  return Number.isFinite(localSeconds) && localSeconds >= SHAKE_DURATION_SECONDS;
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

/** How long the creature is left alone before its eyes go heavy. */
export const IDLE_TIRED_SECONDS = 5;

/** About 95% of the way in 180ms - a change of mood, not a snap. */
const EXPRESSION_APPROACH_RATE = 17;

/**
 * The three faces, written out rather than derived. Neutral is the tall capsule
 * the SVG is authored with; tired is the same eye squashed flat; angry is flat,
 * a shade longer, and tilted *mirrored*, so both brows point at the nose.
 */
const EXPRESSION_POSES: Readonly<Record<CreatureExpressionId, EyeExpressionPose>> = {
  neutral: {
    left: { width: 13, height: 25, rotation: 0 },
    right: { width: 13, height: 25, rotation: 0 },
  },
  tired: {
    left: { width: 16, height: 5, rotation: 0 },
    right: { width: 16, height: 5, rotation: 0 },
  },
  angry: {
    left: { width: 17, height: 6, rotation: 24 },
    right: { width: 17, height: 6, rotation: -24 },
  },
};

/**
 * Which face, from the two things that can claim it. The shake is asked about
 * first and answered whole: it is the run that is angry, not the press, so an
 * early release does not calm the creature down half way through.
 */
export function creatureExpressionAt(
  shaking: boolean,
  idleSeconds: number,
): CreatureExpressionId {
  if (shaking) return "angry";
  if (Number.isFinite(idleSeconds) && idleSeconds >= IDLE_TIRED_SECONDS) return "tired";
  return "neutral";
}

/** A copy, always: the caller eases its own pose in place and would otherwise
    write over the catalogue the next target is read from. */
export function expressionPose(id: CreatureExpressionId): EyeExpressionPose {
  const pose = EXPRESSION_POSES[id];
  return { left: { ...pose.left }, right: { ...pose.right } };
}

const approachEyeShape = (current: EyeShape, target: EyeShape, mix: number): EyeShape => ({
  width: current.width + (target.width - current.width) * mix,
  height: current.height + (target.height - current.height) * mix,
  rotation: current.rotation + (target.rotation - current.rotation) * mix,
});

/**
 * One frame of the change of face, eased exactly as the gaze is: the mix
 * composes, so the speed is the same at 30Hz and 144Hz, and a target that
 * changes mid-transition is picked up from the composite already on screen
 * rather than from the expression it was heading for.
 */
export function approachExpressionPose(
  current: EyeExpressionPose,
  target: EyeExpressionPose,
  deltaSeconds: number,
): EyeExpressionPose {
  const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.064);
  const mix = 1 - Math.exp(-EXPRESSION_APPROACH_RATE * dt);
  return {
    left: approachEyeShape(current.left, target.left, mix),
    right: approachEyeShape(current.right, target.right, mix),
  };
}
