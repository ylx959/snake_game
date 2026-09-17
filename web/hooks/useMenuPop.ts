"use client";

/**
 * The menu's attract loop: one of six flat colours, swapped on a timer.
 *
 * It is the solo palette's idea moved to the title page - an abrupt cut, never
 * a fade - but it reports nothing, because a menu is not a run. It is there so
 * the page looks alive while a player is deciding, which is the one screen in
 * this game where nothing is happening.
 *
 * It never pauses, not even while a player is part way through typing a
 * nickname. It does not have to: nothing on the page moves with it. The
 * buttons, the cards and the fields hold perfectly still under every switch,
 * and the mascot at the top of the home view has a clock of its own that owes
 * this one nothing. An earlier version shook the whole overlay and did need a
 * guard; one after it knocked the title on every switch, which is why this hook
 * used to hand back an alternating `beat` for CSS to restart an animation with.
 * The title is a creature now and there is no animation left to restart, so the
 * colour is all this returns.
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
