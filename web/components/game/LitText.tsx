"use client";

/**
 * Text that turns white wherever the snake is behind it.
 *
 * The snake is painted on the canvas and these readouts are DOM sitting on top
 * of it, so the canvas cannot mask them - it is underneath. Instead the line is
 * written twice: the black one you always see, and a white copy stacked exactly
 * on it whose `clip-path` is the set of cells the snake occupies. Only the
 * covered part of the white copy is ever visible.
 *
 * Purely presentational. It reads the positions the server already sent and
 * asks the game nothing: no hit test, no geometry of its own.
 */

import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type RefObject } from "react";

import { cellEdges } from "@/lib/board";
import type { GameState } from "@/types/game";

/** A zero-area path: clips the white copy away entirely. */
const NOTHING = "M0 0Z";

/** The snake's cells as one SVG path, in the element's own coordinates. */
function useSnakeClip(ref: RefObject<HTMLElement | null>, state: GameState | null): string {
  const [clip, setClip] = useState(NOTHING);

  useEffect(() => {
    const element = ref.current;
    if (!element || !state) {
      setClip(NOTHING);
      return;
    }

    // `clip-path` resolves against the element's own box, but the snake's cells
    // are in viewport coordinates, so every rectangle shifts by that offset.
    const box = element.getBoundingClientRect();
    const cellWidth = window.innerWidth / state.width;
    const cellHeight = window.innerHeight / state.height;

    const path = state.snake
      .map(([x, y]) => {
        const [left, width] = cellEdges(x, cellWidth);
        const [top, height] = cellEdges(y, cellHeight);
        return `M${left - box.left} ${top - box.top}h${width}v${height}h${-width}Z`;
      })
      .join("");

    setClip(path || NOTHING);
  }, [ref, state]);

  return clip;
}

type Props = ComponentPropsWithoutRef<"span"> & { state: GameState | null };

export function LitText({ state, children, className, ...rest }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const clip = useSnakeClip(ref, state);

  return (
    <span {...rest} className={className ? `lit ${className}` : "lit"} ref={ref}>
      {children}
      <span className="lit__over" style={{ clipPath: `path("${clip}")` }} aria-hidden="true">
        {children}
      </span>
    </span>
  );
}
