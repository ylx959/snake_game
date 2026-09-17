"use client";

/**
 * The menu mascot: the favicon, drawn large, watching the pointer.
 *
 * It is the page's own icon and not a new drawing - one black rounded square,
 * two tall white capsules - so the thing in the browser tab and the thing at
 * the top of the menu are recognisably one creature. What is added is that it
 * is alive: the head leans toward the pointer, the eyes lead it, and it blinks
 * on its own whether anybody is moving a mouse or not.
 *
 * **The clock lives here and the maths does not.** Every number this file
 * writes to the SVG comes out of `lib/menuCreature.ts`, which has no React and
 * no DOM in it; this component owns exactly the three things that cannot be
 * pure - the animation frame, the pointer listeners, and the mutable
 * current/target pair they feed.
 *
 * **Nothing here is React state, deliberately.** A pointer move is sixty
 * events a second, and putting one through `useState` would re-render the whole
 * menu - the leaderboard, the nickname field, the lot - for each of them. The
 * aim lives in refs and each frame writes `transform` attributes straight onto
 * three groups, so the menu renders once and then never again while the
 * creature moves.
 *
 * The blink scales an inner group about `y=17.5`, the eyes' own middle, written
 * out as translate/scale/translate rather than left to `transform-origin`:
 * SVG's origin handling is the one place browsers still disagree, and scaling
 * about the element's default origin would shut the eyes *upward* toward the
 * forehead instead of closing them where they are.
 *
 * Touch pointers are ignored. A finger leaves nothing behind when it lifts, so
 * following one means the creature ends every tap frozen wherever the last
 * touch happened to land.
 */

import { useEffect, useRef } from "react";

import {
  approachCreatureAim,
  blinkScaleAt,
  creaturePose,
  neutralAim,
  normalizeCreatureAim,
  type CreatureAim,
} from "@/lib/menuCreature";

export function MenuCreature() {
  const svgRef = useRef<SVGSVGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const blinkRef = useRef<SVGGElement>(null);
  /** Where the pointer is. Written by events, read by the frame. */
  const targetRef = useRef<CreatureAim>(neutralAim());
  /** Where the creature is actually looking. Eased toward the target. */
  const currentRef = useRef<CreatureAim>(neutralAim());

  useEffect(() => {
    let frame = 0;
    let started = 0;
    let previous = 0;

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = svgRef.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return;
      const aim = normalizeCreatureAim(
        event.clientX,
        event.clientY,
        box.left + box.width / 2,
        box.top + box.height / 2,
        // The window's halves, floored at 1: a zero would be a divide by zero,
        // and a window that small has nothing to look at anyway.
        Math.max(1, window.innerWidth / 2),
        Math.max(1, window.innerHeight / 2),
      );
      // A rejected reading leaves the last good aim alone rather than
      // recentring, so a bad rect cannot make the creature twitch.
      if (aim) targetRef.current = aim;
    };

    // The pointer left the document entirely. Look forward again - but as a
    // *target*, so the easing carries it back rather than snapping it.
    const onPointerLeave = () => {
      targetRef.current = neutralAim();
    };

    const tick = (now: number) => {
      if (started === 0) started = now;
      // The first frame has no previous one to measure against, so it eases by
      // nothing and only establishes the baseline.
      const dt = previous === 0 ? 0 : (now - previous) / 1000;
      previous = now;
      currentRef.current = approachCreatureAim(currentRef.current, targetRef.current, dt);
      const pose = creaturePose(currentRef.current);
      headRef.current?.setAttribute(
        "transform",
        `translate(${pose.headX} ${pose.headY}) rotate(${pose.headRotation} 27 27)`,
      );
      eyesRef.current?.setAttribute("transform", `translate(${pose.eyeX} ${pose.eyeY})`);
      const blink = blinkScaleAt((now - started) / 1000);
      blinkRef.current?.setAttribute(
        "transform",
        `translate(0 17.5) scale(1 ${blink}) translate(0 -17.5)`,
      );
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", onPointerLeave);
    frame = requestAnimationFrame(tick);
    // Leaving the home view unmounts this, and the loop and both listeners have
    // to go with it: an orphaned rAF that keeps calling `setAttribute` on a
    // detached node runs for the life of the page.
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className="menu-creature"
      // Six units of air on every side, so the lean and the tip have somewhere
      // to go without the head being clipped by its own box.
      viewBox="-6 -6 66 66"
      width="54"
      height="54"
      // It is the heading's picture, and the heading already says "Snake".
      aria-hidden="true"
      focusable="false"
    >
      <g ref={headRef}>
        <rect width="54" height="54" rx="10" fill="#000000" />
        <g ref={eyesRef}>
          <g ref={blinkRef}>
            <rect x="9" y="5" width="13" height="25" rx="6.5" fill="#ffffff" />
            <rect x="32" y="5" width="13" height="25" rx="6.5" fill="#ffffff" />
          </g>
        </g>
      </g>
    </svg>
  );
}
