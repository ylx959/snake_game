"use client";

/**
 * Text that turns white wherever a snake is behind it.
 *
 * The snakes are painted on the canvas and these readouts are DOM sitting on
 * top of it, so the canvas cannot mask them - it is underneath. Instead the
 * line is written twice: the black one you always see, and a white copy stacked
 * exactly on it whose `clip-path` is the set of cells the snakes occupy. Only
 * the covered part of the white copy is ever visible.
 *
 * Purely presentational. It reads the positions the server already sent and
 * asks the game nothing: no hit test, no geometry of its own. On a shared board
 * it clips against every snake at once, so any of them lights the text.
 */

import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type RefObject } from "react";

import { cellEdges, roundedRectPath, snakeCellRadius } from "@/lib/board";
import { boardShape, litCells, type BoardView } from "@/lib/renderer";

/** A zero-area path: clips the white copy away entirely. */
const NOTHING = "M0 0Z";

/** Every snake's cells as one SVG path, in the element's own coordinates. */
function useSnakeClip(ref: RefObject<HTMLElement | null>, view: BoardView | null): string {
  const [clip, setClip] = useState(NOTHING);

  useEffect(() => {
    const element = ref.current;
    const shape = boardShape(view);
    if (!element || !shape) {
      setClip(NOTHING);
      return;
    }

    // The cells are laid out inside the board, not the window, so the board's
    // own box is what they are measured against. Reading it back from the DOM
    // rather than recomputing the fit is what guarantees the mask lands exactly
    // where the canvas painted - there is only ever one answer.
    const stage = element.closest(".stage");
    if (!stage) {
      setClip(NOTHING);
      return;
    }

    // `clip-path` resolves against the element's own box, so every rectangle
    // shifts by the distance between that box and the board's.
    const box = element.getBoundingClientRect();
    const board = stage.getBoundingClientRect();
    const cellWidth = board.width / shape.cols;
    const cellHeight = board.height / shape.rows;

    const path = litCells(view)
      .map(([x, y]) => {
        const [left, width] = cellEdges(x, cellWidth);
        const [top, height] = cellEdges(y, cellHeight);
        return roundedRectPath(
          board.left + left - box.left,
          board.top + top - box.top,
          width,
          height,
          snakeCellRadius(width, height),
        );
      })
      .join("");

    setClip(path || NOTHING);
  }, [ref, view]);

  return clip;
}

type Props = ComponentPropsWithoutRef<"span"> & { view: BoardView | null };

export function LitText({ view, children, className, ...rest }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const clip = useSnakeClip(ref, view);

  return (
    <span {...rest} className={className ? `lit ${className}` : "lit"} ref={ref}>
      {children}
      <span className="lit__over" style={{ clipPath: `path("${clip}")` }} aria-hidden="true">
        {children}
      </span>
    </span>
  );
}
