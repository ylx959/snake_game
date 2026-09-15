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
 * nickname. It does not have to: the only thing that moves is the title, and
 * the title is only on the home view - the buttons, the cards and the fields
 * hold perfectly still under every switch. An earlier version shook the whole
 * overlay and did need a guard.
 *
 * `beat` alternates "a"/"b" with every switch and exists only so CSS can
 * restart the shake. A CSS animation restarts when its *name* changes, not when
 * the element re-renders, so `globals.css` carries the same keyframes under two
 * names and this flips between them. The obvious alternative - `key={step}` to
 * force a remount - would throw away whatever the player had typed.
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

export function useMenuPop(active: boolean): { color: MenuColor; beat: "a" | "b" } {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setStep((n) => n + 1), HOLD_MS);
    return () => window.clearInterval(id);
  }, [active]);

  return { color: menuColorAt(step), beat: step % 2 === 0 ? "a" : "b" };
}
