"use client";

/**
 * The menu's attract loop: one of six flat colours, swapped on a timer.
 *
 * It is the solo palette's idea moved to the title page - an abrupt cut, never
 * a fade - but it reports nothing, because a menu is not a run. It is there so
 * the page looks alive while a player is deciding, which is the one screen in
 * this game where nothing is happening.
 *
 * It never pauses, not even mid-nickname, because nothing moves with it: the
 * buttons, cards and fields hold still, and the mascot keeps its own clock.
 * Two earlier versions shook the overlay and then the title, and the second is
 * why this used to return an alternating `beat` to restart a CSS animation.
 */

import { useEffect, useState } from "react";

import { menuColorAt, type MenuColor } from "@/lib/palette";

/**
 * How long each colour holds.
 *
 * It was 3.2s and is now 5.6s. The shorter hold made the page busy rather than
 * alive: on the two views that carry a leaderboard and a name field, a ground
 * that turned over twice while somebody read a row was the thing they noticed,
 * not the game. Long enough now to finish reading a card between switches, and
 * still short enough that a player waiting on the title sees it happen.
 */
const HOLD_MS = 5600;

export function useMenuPop(active: boolean): { color: MenuColor } {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setStep((n) => n + 1), HOLD_MS);
    return () => window.clearInterval(id);
  }, [active]);

  return { color: menuColorAt(step) };
}
