"use client";

/**
 * The menu mascot: the favicon drawn large, watching the pointer. The clock and
 * the listeners live here; every number it writes comes from lib/menuCreature.
 * Refs, not state - a pointer move would otherwise re-render the whole menu.
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
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", onPointerLeave);
    frame = requestAnimationFrame(tick);
    // An orphaned rAF writing to a detached node runs for the life of the page.
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
      // Six units of air, so the lean and the tip are not clipped by the box.
      viewBox="-6 -6 66 66"
      width="54"
      height="54"
      // The heading already says "Snake".
      aria-hidden="true"
      focusable="false"
    >
      {/* Its own two tokens, not --ink/--paper: this inverts for the black
          loading screen but stays black on all six menu colours. */}
      <g ref={headRef}>
        <rect width="54" height="54" rx="10" fill="var(--creature-head)" />
        <g ref={eyesRef}>
          <g ref={blinkRef}>
            <rect x="9" y="5" width="13" height="25" rx="6.5" fill="var(--creature-eye)" />
            <rect x="32" y="5" width="13" height="25" rx="6.5" fill="var(--creature-eye)" />
          </g>
        </g>
      </g>
    </svg>
  );
}
