# Creature Tap Shake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the main-menu favicon creature into a button that completes one deterministic 1.5-second whole-body shake, then advances the menu background and creature to an explicit Solo-style colour pair exactly once.

**Architecture:** Extend the existing framework-free creature maths with a pure local-time shake sampler, and compose its pose through a new outer SVG group while preserving the existing gaze and blink groups. Replace the menu's interval-driven colour hook with a manual `advance()` controller; React owns the palette index, while the creature component owns only interaction and animation time.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, inline SVG, `requestAnimationFrame`, `matchMedia`, Node.js built-in test runner

## Global Constraints

- One activation runs for exactly 1.5 seconds even if the pointer is released early.
- Activations during an active run are ignored; they do not restart or queue another colour change.
- The background advances exactly once, only after the shake completes.
- Remove the automatic 5.6-second menu colour interval completely.
- Use the approved six explicit background/creature colour pairs; both eyes stay literal `#FFFFFF`.
- Keep gaze tracking and blinking active during the shake.
- Keep the render on the existing single SVG path and existing `requestAnimationFrame`; add no animation or testing dependency.
- `web/lib/menuCreature.ts` remains pure, framework-free, DOM-free, and clock-free.
- Under `prefers-reduced-motion: reduce`, suppress translation and rotation but preserve the 1.5-second run and its one colour change.
- `LoadingScreen` continues using `<MenuCreature />` as a non-interactive, theme-coloured mascot; only the main-menu instance becomes a colour button.
- The working tree already contains user changes in affected frontend files. Preserve them, review the baseline diff before editing, and stage only this feature's hunks.
- Do not alter backend behavior, Solo palette progression, game rendering, protocol, or multiplayer behavior.

---

## File Structure

- Modify `web/lib/palette.ts`: add the explicit creature colour to each `MenuColor`.
- Modify `web/test/palette.test.mjs`: pin the approved background/creature pairs.
- Modify `web/hooks/useMenuPop.ts`: remove timer ownership and expose stable manual advancement.
- Modify `web/lib/menuCreature.ts`: declare the 1.5-second shake pose and completion boundary as pure functions.
- Modify `web/test/menuCreature.test.mjs`: sweep shake time, direction, bounds, invalid input, reduced motion, and completion.
- Modify `web/components/ui/MenuCreature.tsx`: retain the non-interactive loading variant while adding menu-only button semantics, a one-shot run, outer SVG transform, reduced-motion observation, and one completion callback.
- Modify `web/components/screens/MenuScreen.tsx`: keep the heading independent and pass creature colour/completion props.
- Modify `web/app/page.tsx`: connect the manual palette controller to the menu.
- Modify `web/app/globals.css`: reset the creature button and add pointer, focus, and busy styling only; do not animate the SVG in CSS.
- Modify `CLAUDE.md`: document manual menu colour changes and the shake animation boundary.

---

### Task 1: Explicit menu colour pairs

**Files:**
- Modify: `web/lib/palette.ts:83-121`
- Modify: `web/test/palette.test.mjs`

**Interfaces:**
- Consumes: the existing `MenuColor`, `MENU_COLORS`, and `menuColorAt(index)` API.
- Produces: `MenuColor.creature: string` on all six existing entries.

- [ ] **Step 1: Add the failing menu-pair test**

Extend the palette test import:

```js
import { MENU_COLORS, PAPER, PALETTES, PLAYER_COLORS } from "../lib/palette.ts";
```

Append this exact test to `web/test/palette.test.mjs`:

```js
test("each menu ground carries its approved Solo-style creature colour", () => {
  assert.deepEqual(
    MENU_COLORS.map(({ bg, creature }) => [bg, creature]),
    [
      ["#22DFF5", "#FF4A1F"],
      ["#4B2BEE", "#FFE93D"],
      ["#FF4A1F", "#22DFF5"],
      ["#3EE03E", "#FF1B5E"],
      ["#FF0CBA", "#7BF53A"],
      ["#FFE93D", "#4B2BEE"],
    ],
  );
});
```

- [ ] **Step 2: Run the focused test and verify the intended failure**

Run: `cd web && node --test --test-name-pattern="menu ground" test/palette.test.mjs`

Expected: FAIL because every `creature` value is `undefined`.

- [ ] **Step 3: Add the creature colour to the menu palette**

Change `MenuColor` and `MENU_COLORS` in `web/lib/palette.ts` to:

```ts
export interface MenuColor {
  /** Fills the stage. */
  bg: string;
  /** Fills the favicon creature's head; its eyes remain literal white. */
  creature: string;
  /** `"white"` only where the ground is too dark for black. */
  ink: "black" | "white";
}

export const MENU_COLORS: readonly MenuColor[] = [
  { bg: "#22DFF5", creature: "#FF4A1F", ink: "black" },
  { bg: "#4B2BEE", creature: "#FFE93D", ink: "white" },
  { bg: "#FF4A1F", creature: "#22DFF5", ink: "black" },
  { bg: "#3EE03E", creature: "#FF1B5E", ink: "black" },
  { bg: "#FF0CBA", creature: "#7BF53A", ink: "black" },
  { bg: "#FFE93D", creature: "#4B2BEE", ink: "black" },
];
```

Update the preceding comment to state that each entry owns three independent facts: screen ground, measured text ink, and an explicit creature colour borrowed from the Solo pair lineage.

- [ ] **Step 4: Run the palette tests and verify they pass**

Run: `cd web && node --test test/palette.test.mjs`

Expected: all palette tests PASS, including the exact six-pair assertion.

- [ ] **Step 5: Run static checks and commit the colour model**

Run: `cd web && npm run typecheck && npm run lint`

Expected: both checks exit successfully; adding a required field to the catalogue does not change any consumer yet.

```bash
git add web/lib/palette.ts web/test/palette.test.mjs
git commit -m "feat: pair menu grounds with creature colours"
```

---

### Task 2: Pure 1.5-second whole-body shake sampler

**Files:**
- Modify: `web/lib/menuCreature.ts:1-160`
- Modify: `web/test/menuCreature.test.mjs`

**Interfaces:**
- Consumes: local elapsed seconds and an explicit reduced-motion boolean.
- Produces: `SHAKE_DURATION_SECONDS`, `ShakePose`, `shakePoseAt(localSeconds, reducedMotion?)`, and `shakeCompleteAt(localSeconds)`.

- [ ] **Step 1: Add failing shake behavior tests**

Extend the import in `web/test/menuCreature.test.mjs`:

```js
import {
  approachCreatureAim,
  blinkScaleAt,
  creaturePose,
  SHAKE_DURATION_SECONDS,
  shakeCompleteAt,
  shakePoseAt,
  normalizeCreatureAim,
} from "../lib/menuCreature.ts";
```

Append these tests:

```js
test("a shake starts and finishes at the neutral whole-body pose", () => {
  assert.equal(SHAKE_DURATION_SECONDS, 1.5);
  assert.deepEqual(shakePoseAt(0), { x: 0, rotation: 0 });
  assert.deepEqual(shakePoseAt(1.5), { x: 0, rotation: 0 });
  assert.deepEqual(shakePoseAt(2), { x: 0, rotation: 0 });
  assert.equal(shakeCompleteAt(1.499), false);
  assert.equal(shakeCompleteAt(1.5), true);
});

test("the body alternates left and right during the run", () => {
  const right = shakePoseAt(SHAKE_DURATION_SECONDS / 36);
  const left = shakePoseAt((SHAKE_DURATION_SECONDS * 3) / 36);
  assert.ok(right.x > 0 && right.rotation > 0);
  assert.ok(left.x < 0 && left.rotation < 0);
});

test("the whole shake stays within its declared travel", () => {
  for (let frame = 0; frame <= 180; frame += 1) {
    const pose = shakePoseAt(frame / 120);
    assert.ok(Math.abs(pose.x) <= 3.2 + 1e-12);
    assert.ok(Math.abs(pose.rotation) <= 4.5 + 1e-12);
  }
});

test("reduced motion and invalid time produce a neutral pose", () => {
  assert.deepEqual(shakePoseAt(0.4, true), { x: 0, rotation: 0 });
  assert.deepEqual(shakePoseAt(Number.NaN), { x: 0, rotation: 0 });
  assert.deepEqual(shakePoseAt(Number.POSITIVE_INFINITY), { x: 0, rotation: 0 });
  assert.equal(shakeCompleteAt(Number.NaN), false);
});
```

- [ ] **Step 2: Run the focused tests and verify the intended failure**

Run: `cd web && node --test --test-name-pattern="shake|whole-body|reduced motion" test/menuCreature.test.mjs`

Expected: FAIL because the shake exports do not exist.

- [ ] **Step 3: Implement the pure shake pose**

Add this framework-free code to `web/lib/menuCreature.ts` after `CreaturePose`:

```ts
export interface ShakePose {
  /** SVG units applied to the outer group. */
  x: number;
  /** Degrees about the favicon's 27,27 centre. */
  rotation: number;
}

export const SHAKE_DURATION_SECONDS = 1.5;

const SHAKE_CYCLES = 9;
const SHAKE_X = 3.2;
const SHAKE_ROTATION = 4.5;
const neutralShake = (): ShakePose => ({ x: 0, rotation: 0 });

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

export function shakeCompleteAt(localSeconds: number): boolean {
  return Number.isFinite(localSeconds) && localSeconds >= SHAKE_DURATION_SECONDS;
}
```

The envelope makes the body leave and return to neutral without a jump. Do not add these values to `CreatureAim`; shake is an outer-body pose, while aim remains the absolute gaze target.

- [ ] **Step 4: Run the complete creature math tests**

Run: `cd web && node --test test/menuCreature.test.mjs`

Expected: all existing gaze/blink tests and all new shake tests PASS.

- [ ] **Step 5: Run the framework-boundary check**

Run:

```bash
rg -n "react|window|document|Date\.now|performance\.now|requestAnimationFrame" web/lib/menuCreature.ts
```

Expected: no matches. The library receives time; it never reads a clock or DOM API.

- [ ] **Step 6: Commit the shake model**

```bash
git add -p web/lib/menuCreature.ts web/test/menuCreature.test.mjs
git commit -m "feat: define deterministic creature shake"
```

---

### Task 3: Interactive creature, colour wiring, and documentation

**Files:**
- Modify: `web/hooks/useMenuPop.ts:1-47`
- Modify: `web/components/ui/MenuCreature.tsx:1-145`
- Modify: `web/components/screens/MenuScreen.tsx:20-123`
- Modify: `web/app/page.tsx:26,78-100,128-137`
- Modify: `web/app/globals.css:1-18,72-130,490-586`
- Modify: `CLAUDE.md:133-180,500-530`

**Interfaces:**
- Consumes: `shakePoseAt` and `shakeCompleteAt` from Task 2 plus `MenuColor.creature` from Task 1.
- Produces: `useMenuPop(): { color: MenuColor; advance: () => void }`, `MenuCreature({ color, onShakeComplete })`, and matching `MenuScreen` props `creatureColor` / `onCreatureShakeComplete`.

- [ ] **Step 1: Replace the automatic interval with stable manual advancement**

In `web/hooks/useMenuPop.ts`, replace the React import, comments, signature, and body with the manual controller:

```ts
"use client";

/**
 * The menu colour controller.
 *
 * It owns only the palette index. Time belongs to the creature: a completed
 * shake calls `advance`, and nothing else changes the colour. Keeping the
 * state here lets the background, text ink and creature colour move as one
 * `MenuColor` without teaching the SVG about palette order.
 */

import { useCallback, useState } from "react";

import { menuColorAt, type MenuColor } from "@/lib/palette";

export function useMenuPop(): { color: MenuColor; advance: () => void } {
  const [step, setStep] = useState(0);
  const advance = useCallback(() => setStep((current) => current + 1), []);
  return { color: menuColorAt(step), advance };
}
```

There must be no `useEffect`, `setInterval`, `HOLD_MS`, or `active` parameter left in this file.

- [ ] **Step 2: Add typed component props and the one-shot run state**

Update the React import and creature imports in `MenuCreature.tsx`:

```ts
import { useEffect, useRef, useState, type MouseEvent } from "react";

import {
  approachCreatureAim,
  blinkScaleAt,
  creaturePose,
  neutralAim,
  normalizeCreatureAim,
  shakeCompleteAt,
  shakePoseAt,
  type CreatureAim,
} from "@/lib/menuCreature";
```

Define a union that keeps the existing loading call valid, then change the component signature and add refs/state immediately inside it:

```tsx
type MenuCreatureProps =
  | { color: string; onShakeComplete: () => void }
  | { color?: never; onShakeComplete?: never };

export function MenuCreature({ color, onShakeComplete }: MenuCreatureProps = {}) {
  const interactive = color !== undefined && onShakeComplete !== undefined;
  const [shaking, setShaking] = useState(false);
  const shakingRef = useRef(false);
  const shakeRequestedRef = useRef(false);
  const shakeSinceRef = useRef<number | null>(null);
  const shakeRef = useRef<SVGGElement>(null);
  const reducedMotionRef = useRef(false);
  const onShakeCompleteRef = useRef(onShakeComplete);
  onShakeCompleteRef.current = onShakeComplete;
```

Keep the existing SVG/head/eyes/blink and gaze refs after these declarations. The optional form is deliberate: `LoadingScreen` already renders `<MenuCreature />` and must remain a non-interactive white-on-black mascot.

- [ ] **Step 3: Add idempotent activation and runtime reduced-motion observation**

Before the existing animation effect, add:

```tsx
const startShake = () => {
  if (!interactive) return;
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
```

`pointerdown` calls `startShake` for mouse, pen, and touch. `onClick` starts only zero-detail keyboard or assistive-technology clicks. Ignoring pointer-generated clicks prevents a long press that finishes before release from starting a second shake on the eventual click. The ref guard still makes repeated presses during the active run idempotent.

- [ ] **Step 4: Sample and complete the shake inside the existing frame**

In the existing `tick(now)` function, after writing the blink transform and before requesting the next frame, add:

```ts
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
```

Do not add a `setTimeout` or a second animation frame. On cleanup, clear `shakeRequestedRef.current`, `shakeSinceRef.current`, and `shakingRef.current` before cancelling the existing frame so an unmounted creature cannot call its completion callback later.

- [ ] **Step 5: Turn the creature into a button and add the outer SVG group**

Build the SVG once, then wrap it only for the interactive menu variant. This preserves one SVG renderer and leaves the loading mascot non-interactive:

```tsx
const creature = (
  <svg
    ref={svgRef}
    className="menu-creature"
    viewBox="-6 -6 66 66"
    width="54"
    height="54"
    aria-hidden="true"
    focusable="false"
  >
    <g ref={shakeRef}>
      <g ref={headRef}>
        <rect width="54" height="54" rx="10" fill={color ?? "var(--creature-head)"} />
        <g ref={eyesRef}>
          <g ref={blinkRef}>
            <rect
              x="9"
              y="5"
              width="13"
              height="25"
              rx="6.5"
              fill={interactive ? "#FFFFFF" : "var(--creature-eye)"}
            />
            <rect
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
    data-shaking={shaking ? "" : undefined}
    aria-label="Shake Snake and change colours"
    aria-busy={shaking}
    onPointerDown={startShake}
    onClick={onClick}
  >
    {creature}
  </button>
);
```

The outer `shakeRef` moves the complete creature; the existing inner groups continue to own gaze and blink. The main-menu head receives the explicit `color` and its eyes stay literal white. The loading instance receives neither prop and retains its existing `--creature-head` / `--creature-eye` dark-theme inversion.

- [ ] **Step 6: Separate the accessible heading from the interactive button**

Add these props to `MenuScreen`'s destructuring and type:

```ts
creatureColor,
onCreatureShakeComplete,
```

```ts
creatureColor: string;
onCreatureShakeComplete: () => void;
```

Replace the current heading block with:

```tsx
<div className="menu-creature-heading">
  <h1 className="visually-hidden">Snake</h1>
  <MenuCreature color={creatureColor} onShakeComplete={onCreatureShakeComplete} />
</div>
```

This preserves one `Snake` level-one heading while keeping the actionable button outside the heading's accessible name.

- [ ] **Step 7: Connect the manual controller in `page.tsx`**

Change:

```ts
const menu = useMenuPop(phase === "menu");
```

to:

```ts
const menu = useMenuPop();
```

Pass the new values into `MenuScreen`:

```tsx
creatureColor={menu.color.creature}
onCreatureShakeComplete={menu.advance}
```

Keep `menu.color.bg` and `menu.color.ink` as the single source for the page ground and text direction. Update the nearby comment: the menu is no longer an automatic attract loop; colour advances only after the creature completes a shake.

- [ ] **Step 8: Add button, focus, and busy styling without a CSS animation**

Add beside the existing creature rules in `web/app/globals.css`:

```css
.menu-creature-button {
  display: block;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 10%;
  line-height: 0;
  cursor: pointer;
}

.menu-creature-button[data-shaking] {
  cursor: progress;
}

.menu-creature-button:focus-visible {
  outline: max(2px, calc(var(--cell) * 0.1)) solid var(--ink);
  outline-offset: max(4px, calc(var(--cell) * 0.2));
}
```

Do not add `transition`, `animation`, or active-state `transform` to this button. All creature geometry remains in the SVG sampler. Update the surrounding CSS comments to describe the dynamic paired head rather than a permanently black mascot, and remove references to a timer or 5.6-second colour change.

- [ ] **Step 9: Remove stale automatic-menu documentation**

Make these targeted documentation edits:

- In `MenuScreen.tsx`, replace the opening references to a background changing every 5.6 seconds with the rule that the ground changes only after the mascot's completed shake.
- In `web/app/globals.css`, replace top-level/menu-theme comments describing six colours "on a timer" with manual creature-triggered advancement.
- In `CLAUDE.md`, build on the current documentation (which already describes the shared menu/loading mascot and its own colour tokens) and update the menu theme section to name `MenuColor.creature`, the six explicit pairs, the lack of an interval, the 1.5-second shake, the outer/body versus inner/gaze transform boundary, repeated-activation behavior, and reduced-motion behavior.

Do not rewrite historical notes about the removed chromatic title unless they incorrectly describe current behavior; history may remain history.

- [ ] **Step 10: Run the complete automated verification**

Run:

```bash
cd web
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all Node tests pass, TypeScript and ESLint report no errors, and Next.js completes a production build.

- [ ] **Step 11: Verify the interaction in a browser**

Start the existing backend and frontend using `CLAUDE.md`, then verify all of the following:

- waiting longer than 5.6 seconds does not change the menu background;
- pointer press starts the shake immediately, and releasing early does not stop it;
- holding the pointer past 1.5 seconds and then releasing does not start a second shake;
- the whole creature moves left/right for about 1.5 seconds while its eyes still track and blink;
- the background and creature head change together only after the shake settles;
- each activation advances exactly one entry through all six approved pairs;
- repeated mouse/touch presses during one run do not restart it or skip colours;
- Enter and Space activate the focused creature button once;
- focus remains visible and `aria-busy` is true only during the run;
- both eyes remain white through every pair;
- the loading-screen creature remains non-interactive and keeps its existing white head with black eyes;
- with reduced motion enabled, the button remains busy for 1.5 seconds without lateral motion and then advances once;
- navigating away during a run does not produce a delayed colour change or console warning.

- [ ] **Step 12: Review the scoped diff and commit integration**

Run:

```bash
git diff --check
git diff -- web/hooks/useMenuPop.ts web/components/ui/MenuCreature.tsx web/components/screens/MenuScreen.tsx web/app/page.tsx web/app/globals.css CLAUDE.md
```

Confirm the diff contains no CSS creature animation, no interval/timer in `useMenuPop`, no backend changes, and no changes to either white eye fill.

```bash
git add -p web/hooks/useMenuPop.ts web/components/ui/MenuCreature.tsx web/components/screens/MenuScreen.tsx web/app/page.tsx web/app/globals.css CLAUDE.md
git commit -m "feat: shake creature to advance menu colours"
```
