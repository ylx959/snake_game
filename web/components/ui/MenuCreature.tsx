"use client";

/**
 * The menu mascot: the favicon drawn large, watching the pointer. The clock and
 * the listeners live here; every number it writes comes from lib/menuCreature.
 * Refs, not state - a pointer move would otherwise re-render the whole menu.
 *
 * On the menu it is also the button that changes the screen's colour: one press
 * runs one 1.5s shake, and the colour advances when that run *finishes*. The
 * transform boundary is the point - the outer group is the body, which the
 * shake moves, and the inner groups are the gaze and the blink, which go on
 * running untouched through it. The loading screen renders the same component
 * with no props and gets the old non-interactive mascot.
 *
 * The face is the third thing that clock drives. Angry is read off `shakingRef`
 * rather than off the pointer, so it lasts the whole run even if the press was
 * let go early; tired arrives after five seconds in which nothing was moved,
 * pressed or typed. Activity is *timestamped by the frame*, never by a timeout:
 * an event only raises a flag and the next tick decides what time it was. The
 * propless loading mascot is always neutral - nothing on that screen is idle,
 * because nothing on it can be interacted with.
 *
 * Order of transforms, outermost first: body shake, gaze translation,
 * screen-vertical blink, and then each eye's own expression geometry and tilt.
 * The expression sits innermost so a tilted eye still blinks straight down.
 */

import { useEffect, useRef, useState, type MouseEvent } from "react";

import {
  approachCreatureAim,
  approachExpressionPose,
  blinkScaleAt,
  creatureExpressionAt,
  creaturePose,
  expressionPose,
  eyeCornerRadius,
  neutralAim,
  normalizeCreatureAim,
  shakeCompleteAt,
  shakePoseAt,
  type CreatureAim,
  type EyeShape,
} from "@/lib/menuCreature";

/** Where the two eyes sit in the 54-unit box: the authored rects' centres. */
const EYE_CENTER_Y = 17.5;
const LEFT_EYE_CENTER_X = 15.5;
const RIGHT_EYE_CENTER_X = 38.5;

/**
 * The one thing that writes SVG: the library hands back numbers and this turns
 * them into attributes. Sized about the eye's fixed centre so a squashing eye
 * settles rather than slides, and the radius is the library's, so a neutral eye
 * is byte-for-byte the rect the favicon is authored with.
 */
function drawEye(node: SVGRectElement | null, shape: EyeShape, centerX: number) {
  if (!node) return;
  node.setAttribute("x", String(centerX - shape.width / 2));
  node.setAttribute("y", String(EYE_CENTER_Y - shape.height / 2));
  node.setAttribute("width", String(shape.width));
  node.setAttribute("height", String(shape.height));
  node.setAttribute("rx", String(eyeCornerRadius(shape)));
  node.setAttribute(
    "transform",
    `rotate(${shape.rotation} ${centerX} ${EYE_CENTER_Y})`,
  );
}

/**
 * Both props or neither: a coloured head that reports its shake is the menu,
 * and a bare `<MenuCreature />` is the loading screen's themed mascot. There is
 * no half-interactive third case to reason about.
 */
type MenuCreatureProps =
  | { color: string; onShakeComplete: () => void }
  | { color?: never; onShakeComplete?: never };

export function MenuCreature({ color, onShakeComplete }: MenuCreatureProps = {}) {
  const interactive = color !== undefined && onShakeComplete !== undefined;
  /** Only for `aria-busy`; the run itself is the ref. Nothing on this screen
      changes its looks during a shake - not even the cursor, which stays a
      pointer - so there is no styling hook here to go with it. */
  const [shaking, setShaking] = useState(false);
  /** The guard a second press hits. A ref, so it is true before the re-render. */
  const shakingRef = useRef(false);
  /** Set by the press, read by the next frame, which owns the start time. */
  const shakeRequestedRef = useRef(false);
  const shakeSinceRef = useRef<number | null>(null);
  const shakeRef = useRef<SVGGElement>(null);
  const reducedMotionRef = useRef(false);
  const onShakeCompleteRef = useRef(onShakeComplete);
  // In an effect rather than written during render: a render-phase ref write is
  // what `react-hooks/refs` forbids. The run reports from a frame, which is
  // always after a commit, so the callback it reads is never the stale one.
  useEffect(() => {
    onShakeCompleteRef.current = onShakeComplete;
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const blinkRef = useRef<SVGGElement>(null);
  /** Where the pointer is. Written by events, read by the frame. */
  const targetRef = useRef<CreatureAim>(neutralAim());
  /** Where the creature is actually looking. Eased toward the target. */
  const currentRef = useRef<CreatureAim>(neutralAim());

  const leftEyeRef = useRef<SVGRectElement>(null);
  const rightEyeRef = useRef<SVGRectElement>(null);
  /** The face on screen right now - a composite, not one of the three poses. */
  const currentExpressionRef = useRef(expressionPose("neutral"));
  /** Raised by an event, cleared by the frame that stamps the time for it. */
  const activityRequestedRef = useRef(false);
  const lastActivityRef = useRef<number | null>(null);

  const startShake = () => {
    if (!interactive) return;
    // Before both guards: a press that the shake ignores is still activity, so
    // pointer, touch, keyboard and assistive-technology activation all wake the
    // face even when the run they asked for is refused.
    activityRequestedRef.current = true;
    // Idempotent: presses during a run are ignored rather than queued, so the
    // colour can never skip an entry or restart the shake half way.
    if (shakingRef.current) return;
    shakingRef.current = true;
    shakeRequestedRef.current = true;
    setShaking(true);
  };

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    // Pointer and touch already start on pointerdown. A detail of zero is the
    // keyboard/assistive-technology click, which has no pointerdown of its own.
    if (event.detail === 0) startShake();
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => {
      reducedMotionRef.current = media.matches;
    };
    read();
    media.addEventListener("change", read);
    return () => media.removeEventListener("change", read);
  }, []);

  useEffect(() => {
    let frame = 0;
    let started = 0;
    let previous = 0;

    const onActivity = () => {
      activityRequestedRef.current = true;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (interactive) activityRequestedRef.current = true;
      // A lifted finger leaves no cursor, so following one freezes the gaze.
      if (event.pointerType === "touch") return;
      const box = svgRef.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return;
      const aim = normalizeCreatureAim(
        event.clientX,
        event.clientY,
        box.left + box.width / 2,
        box.top + box.height / 2,
        // Floored at 1: a zero would divide by zero.
        Math.max(1, window.innerWidth / 2),
        Math.max(1, window.innerHeight / 2),
      );
      // A rejected reading keeps the last good aim, so a bad rect cannot twitch.
      if (aim) targetRef.current = aim;
    };

    // A *target*, so the easing carries the gaze back rather than snapping it.
    const onPointerLeave = () => {
      targetRef.current = neutralAim();
    };

    const tick = (now: number) => {
      if (started === 0) started = now;
      // The first frame has nothing to measure against: it only sets the baseline.
      const dt = previous === 0 ? 0 : (now - previous) / 1000;
      previous = now;

      // The frame owns the clock; an event only says "something happened".
      if (lastActivityRef.current === null) lastActivityRef.current = now;
      if (activityRequestedRef.current) {
        lastActivityRef.current = now;
        activityRequestedRef.current = false;
      }
      currentRef.current = approachCreatureAim(currentRef.current, targetRef.current, dt);
      const pose = creaturePose(currentRef.current);
      headRef.current?.setAttribute(
        "transform",
        `translate(${pose.headX} ${pose.headY}) rotate(${pose.headRotation} 27 27)`,
      );
      eyesRef.current?.setAttribute("transform", `translate(${pose.eyeX} ${pose.eyeY})`);
      // Scaled about y=17.5 explicitly: SVG's default transform-origin differs
      // between browsers and would shut the eyes upward into the forehead.
      const blink = blinkScaleAt((now - started) / 1000);
      blinkRef.current?.setAttribute(
        "transform",
        `translate(0 17.5) scale(1 ${blink}) translate(0 -17.5)`,
      );

      // The run is timed off this same clock rather than a `setTimeout`, so the
      // shake cannot drift away from the frame that draws it.
      if (shakeRequestedRef.current) {
        shakeSinceRef.current = now;
        shakeRequestedRef.current = false;
      }

      const shakeSince = shakeSinceRef.current;
      if (shakeSince !== null) {
        const localSeconds = (now - shakeSince) / 1000;
        const shake = shakePoseAt(localSeconds, reducedMotionRef.current);
        shakeRef.current?.setAttribute(
          "transform",
          `translate(${shake.x} 0) rotate(${shake.rotation} 27 27)`,
        );

        if (shakeCompleteAt(localSeconds)) {
          shakeRef.current?.setAttribute("transform", "translate(0 0) rotate(0 27 27)");
          shakeSinceRef.current = null;
          shakingRef.current = false;
          setShaking(false);
          onShakeCompleteRef.current?.();
        }
      }

      // After the shake block, so the frame that ends a run is already calm:
      // angry is released on the same frame the body comes to rest.
      const lastActivity = lastActivityRef.current ?? now;
      const expressionId = interactive
        ? creatureExpressionAt(shakingRef.current, (now - lastActivity) / 1000)
        : "neutral";
      currentExpressionRef.current = approachExpressionPose(
        currentExpressionRef.current,
        expressionPose(expressionId),
        dt,
      );
      drawEye(leftEyeRef.current, currentExpressionRef.current.left, LEFT_EYE_CENTER_X);
      drawEye(rightEyeRef.current, currentExpressionRef.current.right, RIGHT_EYE_CENTER_X);

      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", onPointerLeave);
    // Only the menu has an idle to notice: the loading mascot never tires.
    if (interactive) {
      window.addEventListener("pointerdown", onActivity);
      window.addEventListener("keydown", onActivity);
    }
    frame = requestAnimationFrame(tick);
    // An orphaned rAF writing to a detached node runs for the life of the page.
    // The run is torn down with it: an unmounted creature must not report a
    // shake nobody can see and advance a colour on a screen that has gone.
    return () => {
      shakeRequestedRef.current = false;
      shakeSinceRef.current = null;
      shakingRef.current = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      if (interactive) {
        window.removeEventListener("pointerdown", onActivity);
        window.removeEventListener("keydown", onActivity);
      }
    };
  }, [interactive]);

  const creature = (
    <svg
      ref={svgRef}
      className="menu-creature"
      // Six units of air, so the lean and the tip are not clipped by the box.
      viewBox="-6 -6 66 66"
      width="54"
      height="54"
      // The heading already says "Snake".
      aria-hidden="true"
      focusable="false"
    >
      {/* The body. The shake moves this and nothing inside it, so the gaze and
          the blink below go on running through the whole run. */}
      <g ref={shakeRef}>
        {/* On the menu the head wears its ground's paired colour and the eyes
            are literal white. With no props it falls back to its own two
            tokens, which invert for the black loading screen. */}
        <g ref={headRef}>
          <rect width="54" height="54" rx="10" fill={color ?? "var(--creature-head)"} />
          <g ref={eyesRef}>
            <g ref={blinkRef}>
              {/* Authored neutral, for the server render and the first client
                  frame; every pose after that is written by the frame loop. */}
              <rect
                ref={leftEyeRef}
                x="9"
                y="5"
                width="13"
                height="25"
                rx="6.5"
                fill={interactive ? "#FFFFFF" : "var(--creature-eye)"}
              />
              <rect
                ref={rightEyeRef}
                x="32"
                y="5"
                width="13"
                height="25"
                rx="6.5"
                fill={interactive ? "#FFFFFF" : "var(--creature-eye)"}
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );

  if (!interactive) return creature;

  return (
    <button
      type="button"
      className="menu-creature-button"
      aria-label="Shake Snake and change colours"
      aria-busy={shaking}
      onPointerDown={startShake}
      onClick={onClick}
    >
      {creature}
    </button>
  );
}
