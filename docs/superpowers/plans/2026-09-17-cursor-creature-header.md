# Cursor Creature Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the main menu's visible chromatic `Snake` heading with a favicon-shaped SVG creature whose head and eyes smoothly track the pointer.

**Architecture:** Put all gaze, smoothing, and blink math in a framework-free TypeScript module, keeping the render a deterministic function of explicit inputs. A small React client component owns the browser clock and pointer listeners, renders the only SVG representation of the creature, and is embedded in the existing accessible main heading.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, inline SVG, CSS transforms, `requestAnimationFrame`, Node.js built-in test runner

## Global Constraints

- Preserve the favicon's black rounded-square head and two tall white capsule eyes.
- Remove only the main menu's visible `Snake` word, RGB split, and colour-change jolt.
- Keep the existing menu colour cycle and the Solo Game Over use of `ChromaticText` unchanged.
- The component owns the clock; `web/lib/menuCreature.ts` stays pure, framework-free, and DOM-free.
- Normalize absolute pointer targets on both axes, clamp them to `[-1, 1]`, and reject non-finite or zero-sized input.
- Ignore touch pointers and smoothly return to neutral on `pointerleave`.
- Add no dependency.

---

## File Structure

- Create `web/lib/menuCreature.ts`: pure target normalization, smoothing, pose projection, and deterministic blink sampling.
- Create `web/test/menuCreature.test.mjs`: behavioral tests for every exported animation primitive.
- Create `web/components/ui/MenuCreature.tsx`: pointer/clock host and the one inline SVG renderer.
- Modify `web/components/screens/MenuScreen.tsx`: replace the chromatic word with the creature while retaining an accessible `h1`.
- Modify `web/hooks/useMenuPop.ts`: remove the obsolete `beat` return value while retaining background colour timing.
- Modify `web/app/page.tsx`: stop passing `beat` into `MenuScreen`.
- Modify `web/app/globals.css`: add creature layout styles, remove menu-title-only jolt styles, and retain generic chromatic styles used by Solo Game Over.

---

### Task 1: Pure creature animation model

**Files:**
- Create: `web/lib/menuCreature.ts`
- Create: `web/test/menuCreature.test.mjs`

**Interfaces:**
- Consumes: pointer/client geometry as numbers and elapsed animation time in seconds.
- Produces: `CreatureAim`, `CreaturePose`, `neutralAim()`, `normalizeCreatureAim(...)`, `approachCreatureAim(...)`, `creaturePose(...)`, and `blinkScaleAt(...)`.

- [ ] **Step 1: Write failing tests for normalization and rejection**

Create `web/test/menuCreature.test.mjs` with these cases:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  approachCreatureAim,
  blinkScaleAt,
  creaturePose,
  normalizeCreatureAim,
} from "../lib/menuCreature.ts";

test("the mascot centre is a neutral target", () => {
  assert.deepEqual(normalizeCreatureAim(500, 300, 500, 300, 500, 300), { x: 0, y: 0 });
});

test("viewport edges map to signed unit targets and clamp beyond them", () => {
  assert.deepEqual(normalizeCreatureAim(0, 0, 500, 300, 500, 300), { x: -1, y: -1 });
  assert.deepEqual(normalizeCreatureAim(1200, 900, 500, 300, 500, 300), { x: 1, y: 1 });
});

test("invalid geometry never enters the creature state", () => {
  assert.equal(normalizeCreatureAim(1, 1, 0, 0, 0, 100), null);
  assert.equal(normalizeCreatureAim(Number.NaN, 1, 0, 0, 100, 100), null);
});
```

- [ ] **Step 2: Run the focused tests and verify the intended failure**

Run: `cd web && node --test test/menuCreature.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/menuCreature.ts`.

- [ ] **Step 3: Implement target types and normalization**

Create `web/lib/menuCreature.ts` with a framework-free boundary:

```ts
export interface CreatureAim {
  x: number;
  y: number;
}

export interface CreaturePose {
  headX: number;
  headY: number;
  headRotation: number;
  eyeX: number;
  eyeY: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

export const neutralAim = (): CreatureAim => ({ x: 0, y: 0 });

export function normalizeCreatureAim(
  pointerX: number,
  pointerY: number,
  centerX: number,
  centerY: number,
  halfViewportWidth: number,
  halfViewportHeight: number,
): CreatureAim | null {
  const values = [pointerX, pointerY, centerX, centerY, halfViewportWidth, halfViewportHeight];
  if (!values.every(Number.isFinite) || halfViewportWidth <= 0 || halfViewportHeight <= 0) {
    return null;
  }
  return {
    x: clamp((pointerX - centerX) / halfViewportWidth, -1, 1),
    y: clamp((pointerY - centerY) / halfViewportHeight, -1, 1),
  };
}
```

- [ ] **Step 4: Run the focused tests and verify normalization passes**

Run: `cd web && node --test test/menuCreature.test.mjs`

Expected: the three normalization tests PASS.

- [ ] **Step 5: Add failing tests for smoothing, pose limits, and blinking**

Append exact behavior checks:

```js
test("smoothing is stable across different frame sizes", () => {
  const start = { x: 0, y: 0 };
  const target = { x: 1, y: -1 };
  const oneFrame = approachCreatureAim(start, target, 1 / 30);
  const halfA = approachCreatureAim(start, target, 1 / 60);
  const halfB = approachCreatureAim(halfA, target, 1 / 60);
  assert.ok(Math.abs(oneFrame.x - halfB.x) < 1e-12);
  assert.ok(Math.abs(oneFrame.y - halfB.y) < 1e-12);
});

test("eyes travel farther than the head without exceeding declared limits", () => {
  const pose = creaturePose({ x: 1, y: -1 });
  assert.deepEqual(pose, {
    headX: 1.8,
    headY: -1.35,
    headRotation: 3.2,
    eyeX: 3.6,
    eyeY: -2.7,
  });
});

test("blink sampling is deterministic and reopens fully", () => {
  assert.equal(blinkScaleAt(0), 1);
  assert.equal(blinkScaleAt(4.12), blinkScaleAt(4.12));
  assert.ok(blinkScaleAt(4.12) < 0.2);
  assert.equal(blinkScaleAt(4.4), 1);
});
```

- [ ] **Step 6: Implement the pure animation functions**

Add these constants and functions to `web/lib/menuCreature.ts`:

```ts
const FOLLOW_RATE = 11;
const HEAD_X = 1.8;
const HEAD_Y = 1.35;
const HEAD_ROTATION = 3.2;
const EYE_X = 3.6;
const EYE_Y = 2.7;
const BLINK_PERIOD = 4.2;
const BLINK_DURATION = 0.16;

export function approachCreatureAim(
  current: CreatureAim,
  target: CreatureAim,
  deltaSeconds: number,
): CreatureAim {
  const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.064);
  const mix = 1 - Math.exp(-FOLLOW_RATE * dt);
  return {
    x: current.x + (target.x - current.x) * mix,
    y: current.y + (target.y - current.y) * mix,
  };
}

export function creaturePose(aim: CreatureAim): CreaturePose {
  const x = clamp(Number.isFinite(aim.x) ? aim.x : 0, -1, 1);
  const y = clamp(Number.isFinite(aim.y) ? aim.y : 0, -1, 1);
  return {
    headX: x * HEAD_X,
    headY: y * HEAD_Y,
    headRotation: x * HEAD_ROTATION,
    eyeX: x * EYE_X,
    eyeY: y * EYE_Y,
  };
}

export function blinkScaleAt(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 1;
  const phase = seconds % BLINK_PERIOD;
  if (phase < BLINK_PERIOD - BLINK_DURATION) return 1;
  const progress = (phase - (BLINK_PERIOD - BLINK_DURATION)) / BLINK_DURATION;
  return Math.max(0.08, Math.abs(progress * 2 - 1));
}
```

- [ ] **Step 7: Run the tests and commit the animation model**

Run: `cd web && node --test test/menuCreature.test.mjs`

Expected: all creature-model tests PASS.

```bash
git add web/lib/menuCreature.ts web/test/menuCreature.test.mjs
git commit -m "test: define menu creature motion"
```

---

### Task 2: Self-contained SVG creature component

**Files:**
- Create: `web/components/ui/MenuCreature.tsx`
- Modify: `web/app/globals.css`

**Interfaces:**
- Consumes: all pure functions exported by `web/lib/menuCreature.ts` in Task 1.
- Produces: `MenuCreature(): React.ReactElement`, a decorative, self-cleaning client component with no props.

- [ ] **Step 1: Create the client component and its lifecycle**

Implement `web/components/ui/MenuCreature.tsx` with refs rather than React state so pointer movement does not re-render the menu:

```tsx
"use client";

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
  const targetRef = useRef<CreatureAim>(neutralAim());
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
        Math.max(1, window.innerWidth / 2),
        Math.max(1, window.innerHeight / 2),
      );
      if (aim) targetRef.current = aim;
    };

    const onPointerLeave = () => {
      targetRef.current = neutralAim();
    };

    const tick = (now: number) => {
      if (started === 0) started = now;
      const dt = previous === 0 ? 0 : (now - previous) / 1000;
      previous = now;
      currentRef.current = approachCreatureAim(currentRef.current, targetRef.current, dt);
      const pose = creaturePose(currentRef.current);
      headRef.current?.setAttribute(
        "transform",
        `translate(${pose.headX} ${pose.headY}) rotate(${pose.headRotation} 27 27)`,
      );
      eyesRef.current?.setAttribute(
        "transform",
        `translate(${pose.eyeX} ${pose.eyeY})`,
      );
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
      viewBox="-6 -6 66 66"
      width="54"
      height="54"
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
```

The inner group scales explicitly around `y=17.5`, so blinking does not depend on browser-specific SVG `transform-origin` behavior and does not move the eyes toward the top edge.

- [ ] **Step 2: Add component layout styles**

Add beside `.title` in `web/app/globals.css`:

```css
.menu-creature-heading {
  margin: 0;
  line-height: 0;
}

.menu-creature {
  display: block;
  width: max(72px, calc(var(--cell) * 5.4));
  height: auto;
  overflow: visible;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```

Do not add a reduced-motion rule that freezes the gaze or blink: the old menu jolt is decorative and will be deleted, while tracking and blinking are the creature itself.

- [ ] **Step 3: Run static checks**

Run: `cd web && npm run typecheck && npm run lint`

Expected: TypeScript and ESLint exit successfully with no hook-cleanup, SVG, or accessibility errors.

- [ ] **Step 4: Commit the component**

```bash
git add web/components/ui/MenuCreature.tsx web/app/globals.css
git commit -m "feat: add pointer-following menu creature"
```

---

### Task 3: Replace the menu heading and remove obsolete jolt wiring

**Files:**
- Modify: `web/components/screens/MenuScreen.tsx:20-54,99-105`
- Modify: `web/hooks/useMenuPop.ts`
- Modify: `web/app/page.tsx:80-100,130-145`
- Modify: `web/app/globals.css:74-105,246-407`

**Interfaces:**
- Consumes: `MenuCreature` from Task 2 and `MenuColor` from the existing palette module.
- Produces: a main menu with no `beat` API and `useMenuPop(active): { color: MenuColor }`.

- [ ] **Step 1: Replace the visible word while retaining the accessible heading**

In `MenuScreen.tsx`, replace the `ChromaticText` import with:

```ts
import { MenuCreature } from "@/components/ui/MenuCreature";
```

Remove `beat` from the component arguments and prop type. Replace the home heading with:

```tsx
<h1 className="menu-creature-heading">
  <span className="visually-hidden">Snake</span>
  <MenuCreature />
</h1>
```

Update the file comment so it describes the mascot rather than title text taking the menu colour pair.

- [ ] **Step 2: Remove the animation-restart value from the menu colour hook**

Change the hook signature and return value in `web/hooks/useMenuPop.ts`:

```ts
export function useMenuPop(active: boolean): { color: MenuColor } {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setStep((n) => n + 1), HOLD_MS);
    return () => window.clearInterval(id);
  }, [active]);

  return { color: menuColorAt(step) };
}
```

Delete comments claiming the title is jolted or that two animation names must alternate. Keep the 5.6-second colour hold and interval cleanup unchanged.

- [ ] **Step 3: Stop passing `beat` from the page**

In `web/app/page.tsx`, keep `const menu = useMenuPop(phase === "menu")` for `menu.color`, but remove:

```tsx
beat={menu.beat}
```

Update the nearby comment to say the hook drives the menu background colour only.

- [ ] **Step 4: Delete only menu-title-specific chromatic CSS**

Remove `.title[data-pop]`, `.title[data-pop="b"]`, `.title[data-pop] .chroma`, `.title[data-pop="b"] .chroma`, all four `chroma-hit-*`/`menu-pop-*` keyframe blocks, and their reduced-motion override from `web/app/globals.css`.

Retain all generic `.chroma`, `.chroma::before`, `.chroma::after`, `chroma-drift-*`, and `chroma-jolt` rules around line 1095 because `SoloScreen.tsx` still renders its Game Over score with `ChromaticText`.

Update the pop-theme comments around lines 74-105 so they no longer describe the deleted heading aberration or `--emboss` interaction. Do not alter menu colours, button/card tokens, or `MENU_COLORS`.

- [ ] **Step 5: Run the complete frontend verification**

Run:

```bash
cd web
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all tests pass, TypeScript and ESLint report no errors, and Next.js completes a production build.

- [ ] **Step 6: Verify interaction in the browser**

Start the existing frontend and backend using the commands in `CLAUDE.md`. On the main menu, verify:

- no visible `Snake` word, RGB fringe, or colour-change shake remains;
- the accessibility tree still exposes one `Snake` level-one heading;
- the black rounded-square head matches `web/app/icon.svg`;
- pointer at centre is neutral and all four corners move the head and eyes in the correct direction;
- eyes travel farther than the head without leaving the black silhouette;
- pointer exit returns smoothly to centre and touch events do not leave a stuck gaze;
- blinking continues and the 5.6-second menu background cycle is unchanged;
- narrow and wide viewports keep the mascot centred without clipping;
- navigating to Solo and back leaves exactly one active animation loop and one pointer listener;
- the Solo Game Over score retains its existing chromatic rendering.

- [ ] **Step 7: Review the scoped diff and commit integration**

Run:

```bash
git diff --check
git diff -- web/components/screens/MenuScreen.tsx web/hooks/useMenuPop.ts web/app/page.tsx web/app/globals.css
```

Confirm that no backend, game renderer, palette constant, or unrelated `ChromaticText` consumer changed.

```bash
git add web/components/screens/MenuScreen.tsx web/hooks/useMenuPop.ts web/app/page.tsx web/app/globals.css
git commit -m "feat: replace menu title with cursor creature"
```
