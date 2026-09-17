"use client";

/**
 * The menu colour controller.
 *
 * It owns only the palette index. Time belongs to the creature: a completed
 * shake calls `advance`, and nothing else changes the colour. Keeping the
 * state here lets the background, text ink and creature colour move as one
 * `MenuColor` without teaching the SVG about palette order.
 *
 * It used to be an attract loop, swapping colour every 5.6s on an interval.
 * The colour is now something a player *does* rather than something that
 * happens at them, so there is no timer here at all - and no `active`
 * parameter, because there is nothing left to pause.
 */

import { useCallback, useState } from "react";

import { menuColorAt, type MenuColor } from "@/lib/palette";

export function useMenuPop(): { color: MenuColor; advance: () => void } {
  const [step, setStep] = useState(0);
  const advance = useCallback(() => setStep((current) => current + 1), []);
  return { color: menuColorAt(step), advance };
}
