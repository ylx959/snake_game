# Creature Eye Expressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the interactive menu creature neutral, tired, and angry eye expressions: angry throughout its 1.5-second shake, tired after exactly five seconds without user activity, and neutral immediately after any activity.

**Architecture:** Extend `web/lib/menuCreature.ts` with a declarative three-pose eye catalogue, a pure state-priority function, and frame-rate-independent expression interpolation. `MenuCreature.tsx` keeps the browser clock and activity listeners, samples the pure model inside its existing animation frame, and writes size/rounding/mirrored rotation onto the same two SVG rectangles already used for gaze and blinking.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, inline SVG, `requestAnimationFrame`, Node.js built-in test runner

## Global Constraints

- Expression priority is `angry > tired > neutral`.
- The creature is angry for the complete shake, including the part after an early pointer release.
- The creature becomes tired at exactly five seconds without pointer movement, pointer interaction, or keyboard interaction.
- Any activity returns the target expression to neutral and restarts the five-second idle clock.
- The loading-screen `<MenuCreature />` remains neutral; idle and angry expressions apply only to the interactive main-menu instance.
- Use the same two SVG eye rectangles for all expressions; do not add alternative paths, duplicate renderers, CSS keyframes, or dependencies.
- Neutral eyes remain `13×25` capsules. Tired eyes are `16×5` horizontal capsules. Angry eyes are `17×6`, with left `+24°` and right `-24°` mirrored rotation.
- Expression transitions approach their target smoothly at the same speed across display refresh rates and continue from the currently rendered composite when interrupted.
- Gaze translation remains on the outer eye group; per-eye expression geometry stays inside it; blink remains the final screen-vertical scale around `y=17.5`.
- Cursor tracking, blinking, shake completion, colour changes, keyboard activation, touch activation, and reduced-motion behavior remain unchanged.
- The working tree contains pre-existing user changes in the affected files. Preserve them and stage only this feature's hunks.

---

## File Structure

- Modify `web/lib/menuCreature.ts`: expression ids, per-eye pose data, five-second state selection, and pure expression interpolation.
- Modify `web/test/menuCreature.test.mjs`: state priority, exact eye poses, interpolation continuity, frame-rate independence, and silhouette bounds.
- Modify `web/components/ui/MenuCreature.tsx`: activity tracking, expression sampling, individual eye refs, and SVG attribute updates.
- Modify `CLAUDE.md`: document expression meanings, precedence, timing, transform order, and the neutral loading variant.

No palette, hook, CSS, backend, canvas, protocol, or game-state file changes.

---

### Task 1: Declarative expression model

**Files:**
- Modify: `web/lib/menuCreature.ts:6-172`
- Modify: `web/test/menuCreature.test.mjs`

**Interfaces:**
- Consumes: elapsed idle seconds, the existing shake-active boolean, and per-frame delta seconds.
- Produces: `CreatureExpressionId`, `EyeShape`, `EyeExpressionPose`, `IDLE_TIRED_SECONDS`, `creatureExpressionAt(shaking, idleSeconds)`, `expressionPose(id)`, and `approachExpressionPose(current, target, deltaSeconds)`.

- [ ] **Step 1: Add failing tests for state priority and exact poses**

Extend the import in `web/test/menuCreature.test.mjs`:

```js
import {
  approachCreatureAim,
  approachExpressionPose,
  blinkScaleAt,
  creatureExpressionAt,
  creaturePose,
  expressionPose,
  IDLE_TIRED_SECONDS,
  SHAKE_DURATION_SECONDS,
  shakeCompleteAt,
  shakePoseAt,
  normalizeCreatureAim,
} from "../lib/menuCreature.ts";
```

Append these tests:

```js
test("expression priority is angry, then tired, then neutral", () => {
  assert.equal(IDLE_TIRED_SECONDS, 5);
  assert.equal(creatureExpressionAt(false, 4.999), "neutral");
  assert.equal(creatureExpressionAt(false, 5), "tired");
  assert.equal(creatureExpressionAt(false, 90), "tired");
  assert.equal(creatureExpressionAt(true, 90), "angry");
  assert.equal(creatureExpressionAt(false, Number.NaN), "neutral");
});

test("the three expression poses use the approved capsule geometry", () => {
  assert.deepEqual(expressionPose("neutral"), {
    left: { width: 13, height: 25, rotation: 0 },
    right: { width: 13, height: 25, rotation: 0 },
  });
  assert.deepEqual(expressionPose("tired"), {
    left: { width: 16, height: 5, rotation: 0 },
    right: { width: 16, height: 5, rotation: 0 },
  });
  assert.deepEqual(expressionPose("angry"), {
    left: { width: 17, height: 6, rotation: 24 },
    right: { width: 17, height: 6, rotation: -24 },
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the intended failure**

Run: `cd web && node --test --test-name-pattern="expression priority|expression poses" test/menuCreature.test.mjs`

Expected: FAIL because the expression exports do not exist.

- [ ] **Step 3: Declare expression types, state selection, and catalogue poses**

Add the types near the existing `CreaturePose` and `ShakePose` declarations:

```ts
export type CreatureExpressionId = "neutral" | "tired" | "angry";

export interface EyeShape {
  width: number;
  height: number;
  /** SVG degrees about this eye's own centre; positive turns clockwise. */
  rotation: number;
}

export interface EyeExpressionPose {
  left: EyeShape;
  right: EyeShape;
}
```

After the existing `clamp` helper, add:

```ts
export const IDLE_TIRED_SECONDS = 5;

const EXPRESSION_APPROACH_RATE = 17;

const EXPRESSION_POSES: Readonly<Record<CreatureExpressionId, EyeExpressionPose>> = {
  neutral: {
    left: { width: 13, height: 25, rotation: 0 },
    right: { width: 13, height: 25, rotation: 0 },
  },
  tired: {
    left: { width: 16, height: 5, rotation: 0 },
    right: { width: 16, height: 5, rotation: 0 },
  },
  angry: {
    left: { width: 17, height: 6, rotation: 24 },
    right: { width: 17, height: 6, rotation: -24 },
  },
};

export function creatureExpressionAt(
  shaking: boolean,
  idleSeconds: number,
): CreatureExpressionId {
  if (shaking) return "angry";
  if (Number.isFinite(idleSeconds) && idleSeconds >= IDLE_TIRED_SECONDS) return "tired";
  return "neutral";
}

export function expressionPose(id: CreatureExpressionId): EyeExpressionPose {
  const pose = EXPRESSION_POSES[id];
  return { left: { ...pose.left }, right: { ...pose.right } };
}
```

Returning copies prevents the component's current-pose ref from mutating catalogue data. Do not encode labels or trigger rules in JSX.

- [ ] **Step 4: Run the state and catalogue tests**

Run: `cd web && node --test --test-name-pattern="expression priority|expression poses" test/menuCreature.test.mjs`

Expected: both new tests PASS.

- [ ] **Step 5: Add failing interpolation and geometry tests**

Append:

```js
const expressionNumbers = (pose) => [
  pose.left.width,
  pose.left.height,
  pose.left.rotation,
  pose.right.width,
  pose.right.height,
  pose.right.rotation,
];

test("expression interpolation is stable across frame sizes", () => {
  const start = expressionPose("neutral");
  const target = expressionPose("angry");
  const oneFrame = approachExpressionPose(start, target, 1 / 30);
  const halfA = approachExpressionPose(start, target, 1 / 60);
  const halfB = approachExpressionPose(halfA, target, 1 / 60);

  expressionNumbers(oneFrame).forEach((value, index) => {
    assert.ok(Math.abs(value - expressionNumbers(halfB)[index]) < 1e-12);
  });
});

test("an interrupted expression continues from the displayed composite", () => {
  const displayed = approachExpressionPose(
    expressionPose("neutral"),
    expressionPose("tired"),
    1 / 60,
  );
  assert.deepEqual(
    approachExpressionPose(displayed, expressionPose("angry"), 0),
    displayed,
  );
});

test("every expression stays inside the head at full gaze travel", () => {
  const centres = [15.5, 38.5];
  const gazeTravel = 3.6;

  const horizontalExtent = (eye) => {
    const radians = Math.abs(eye.rotation) * Math.PI / 180;
    return (
      Math.cos(radians) * eye.width / 2
      + Math.sin(radians) * eye.height / 2
    );
  };

  for (const id of ["neutral", "tired", "angry"]) {
    const pose = expressionPose(id);
    assert.ok(
      centres[0] - horizontalExtent(pose.left) - gazeTravel > 0,
      `${id} left edge`,
    );
    assert.ok(
      centres[1] + horizontalExtent(pose.right) + gazeTravel < 54,
      `${id} right edge`,
    );
  }

  const angry = expressionPose("angry");
  assert.ok(angry.left.width / angry.left.height > 1.7);
  assert.equal(angry.left.rotation, -angry.right.rotation);
});
```

The final ratio assertion carries over the relevant grokbot constraint: a tilt of at least 20 degrees needs an elongated eye, or rotating it is visually meaningless.

- [ ] **Step 6: Run the focused tests and verify interpolation is missing**

Run: `cd web && node --test --test-name-pattern="interpolation|interrupted|inside the head" test/menuCreature.test.mjs`

Expected: FAIL because `approachExpressionPose` is not exported.

- [ ] **Step 7: Implement frame-rate-independent expression interpolation**

Add below `expressionPose` in `web/lib/menuCreature.ts`:

```ts
const approachEyeShape = (current: EyeShape, target: EyeShape, mix: number): EyeShape => ({
  width: current.width + (target.width - current.width) * mix,
  height: current.height + (target.height - current.height) * mix,
  rotation: current.rotation + (target.rotation - current.rotation) * mix,
});

export function approachExpressionPose(
  current: EyeExpressionPose,
  target: EyeExpressionPose,
  deltaSeconds: number,
): EyeExpressionPose {
  const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.064);
  const mix = 1 - Math.exp(-EXPRESSION_APPROACH_RATE * dt);
  return {
    left: approachEyeShape(current.left, target.left, mix),
    right: approachEyeShape(current.right, target.right, mix),
  };
}
```

At rate 17 the pose covers about 95% of the distance in 180ms. The exponential mix composes, so two 60Hz frames equal one 30Hz frame, and changing the target mid-transition begins from the exact composite already on screen.

- [ ] **Step 8: Run the complete creature model tests**

Run: `cd web && node --test test/menuCreature.test.mjs`

Expected: all gaze, blink, shake, state, catalogue, interpolation, and bounds tests PASS.

- [ ] **Step 9: Verify the pure-module boundary and commit**

Run:

```bash
rg -n "react|window|document|Date\.now|performance\.now|requestAnimationFrame" web/lib/menuCreature.ts
git diff --check -- web/lib/menuCreature.ts web/test/menuCreature.test.mjs
```

Expected: the boundary search prints no matches and the diff check exits successfully.

Because both files contain pre-existing user changes, stage only the expression hunks:

```bash
git add -p web/lib/menuCreature.ts web/test/menuCreature.test.mjs
git commit -m "feat: define creature eye expressions"
```

---

### Task 2: Activity-driven expression rendering

**Files:**
- Modify: `web/components/ui/MenuCreature.tsx:16-245`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `approachExpressionPose`, `creatureExpressionAt`, `expressionPose`, and `EyeShape` from Task 1 plus the existing `shakingRef` and frame clock.
- Produces: no new public component API; the existing interactive menu props and prop-free loading variant remain unchanged.

- [ ] **Step 1: Import the expression model and add per-eye rendering helpers**

Extend the import from `@/lib/menuCreature`:

```ts
import {
  approachCreatureAim,
  approachExpressionPose,
  blinkScaleAt,
  creatureExpressionAt,
  creaturePose,
  expressionPose,
  neutralAim,
  normalizeCreatureAim,
  shakeCompleteAt,
  shakePoseAt,
  type CreatureAim,
  type EyeShape,
} from "@/lib/menuCreature";
```

Above `MenuCreature`, add the fixed centres and the one DOM-writing helper:

```ts
const EYE_CENTER_Y = 17.5;
const LEFT_EYE_CENTER_X = 15.5;
const RIGHT_EYE_CENTER_X = 38.5;

function drawEye(node: SVGRectElement | null, shape: EyeShape, centerX: number) {
  if (!node) return;
  node.setAttribute("x", String(centerX - shape.width / 2));
  node.setAttribute("y", String(EYE_CENTER_Y - shape.height / 2));
  node.setAttribute("width", String(shape.width));
  node.setAttribute("height", String(shape.height));
  node.setAttribute("rx", String(shape.height / 2));
  node.setAttribute(
    "transform",
    `rotate(${shape.rotation} ${centerX} ${EYE_CENTER_Y})`,
  );
}
```

The library returns data; only the component writes SVG attributes. `rx = height / 2` keeps every in-between shape a true capsule.

- [ ] **Step 2: Add expression and activity refs**

Beside the existing eye/gaze refs inside `MenuCreature`, add:

```ts
const leftEyeRef = useRef<SVGRectElement>(null);
const rightEyeRef = useRef<SVGRectElement>(null);
const currentExpressionRef = useRef(expressionPose("neutral"));
const activityRequestedRef = useRef(false);
const lastActivityRef = useRef<number | null>(null);
```

At the first line of `startShake`, before either guard, add:

```ts
activityRequestedRef.current = true;
```

This makes pointer, touch, keyboard, and assistive-technology activation wake the face even when a repeated press is ignored by the shake guard.

- [ ] **Step 3: Record pointer and keyboard activity without adding a timer**

Inside the existing animation effect, add:

```ts
const onActivity = () => {
  activityRequestedRef.current = true;
};
```

At the beginning of the existing `onPointerMove`, before the touch early return, add:

```ts
if (interactive) activityRequestedRef.current = true;
```

After the existing pointer listeners are attached, attach activity listeners only for the interactive menu variant:

```ts
if (interactive) {
  window.addEventListener("pointerdown", onActivity);
  window.addEventListener("keydown", onActivity);
}
```

Remove them under the same condition in cleanup, and change the effect dependency from `[]` to `[interactive]`:

```ts
if (interactive) {
  window.removeEventListener("pointerdown", onActivity);
  window.removeEventListener("keydown", onActivity);
}
```

No `setTimeout` or interval is added. Events only request an activity timestamp; the existing frame clock owns the actual time.

- [ ] **Step 4: Select and interpolate the expression in the existing frame**

Near the beginning of `tick(now)`, immediately after calculating `dt`, add:

```ts
if (lastActivityRef.current === null) lastActivityRef.current = now;
if (activityRequestedRef.current) {
  lastActivityRef.current = now;
  activityRequestedRef.current = false;
}
```

After the existing shake block—so a completing shake can release angry on that same frame—add:

```ts
const lastActivity = lastActivityRef.current ?? now;
const expressionId = interactive
  ? creatureExpressionAt(shakingRef.current, (now - lastActivity) / 1000)
  : "neutral";
const expressionTarget = expressionPose(expressionId);
currentExpressionRef.current = approachExpressionPose(
  currentExpressionRef.current,
  expressionTarget,
  dt,
);
drawEye(leftEyeRef.current, currentExpressionRef.current.left, LEFT_EYE_CENTER_X);
drawEye(rightEyeRef.current, currentExpressionRef.current.right, RIGHT_EYE_CENTER_X);
```

Keep gaze translation on `eyesRef` and the existing blink transform on `blinkRef`. Expression rotation belongs to each rectangle, below both groups. Do not move expression values into React state.

- [ ] **Step 5: Attach refs to the existing eye rectangles**

Update the two rectangles without changing their colours or nesting:

```tsx
<rect
  ref={leftEyeRef}
  x="9"
  y="5"
  width="13"
  height="25"
  rx="6.5"
  fill={interactive ? "#FFFFFF" : "var(--creature-eye)"}
/>
<rect
  ref={rightEyeRef}
  x="32"
  y="5"
  width="13"
  height="25"
  rx="6.5"
  fill={interactive ? "#FFFFFF" : "var(--creature-eye)"}
/>
```

The JSX stays neutral for server rendering and the first client frame. The frame loop then owns every in-between pose.

- [ ] **Step 6: Update architecture comments and documentation**

Update `MenuCreature.tsx`'s opening comment to record:

- angry is derived from `shakingRef`, so it lasts for the complete run rather than pointer hold time;
- interactive activity is timestamped by the frame clock, not a timeout;
- five idle seconds select tired;
- the loading variant always selects neutral;
- transform order is outer gaze translation → screen-vertical blink → per-eye expression rotation/geometry.

Add the same durable rules to the existing creature section in `CLAUDE.md`, including the exact three poses and the `angry > tired > neutral` precedence. Preserve the current shake, colour-pair, shared loading/menu mascot, and token documentation.

- [ ] **Step 7: Run automated verification**

Run:

```bash
cd web
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: every Node test passes, TypeScript and ESLint report no errors, and the production build completes.

- [ ] **Step 8: Verify expression behavior in the browser**

Start the existing backend and frontend using `CLAUDE.md`, then verify:

- the menu creature begins neutral;
- at 4.9 seconds without activity it remains neutral, and just after 5 seconds it smoothly becomes tired;
- moving the pointer immediately targets neutral and restarts the full five-second idle period;
- any key, pointer press, touch, or creature activation also wakes it;
- starting a shake targets angry immediately and keeps angry for the complete 1.5-second run after an early release;
- the shake completion returns the target to neutral before the next five-second idle period can select tired;
- repeated presses during a shake remain angry but do not restart the shake or skip colours;
- both angry eyes tilt toward the centre, not in the same direction;
- gaze tracking continues in all expressions and no eye leaves the coloured head at the four viewport corners;
- blinking vertically compresses neutral, tired, and angry eyes without changing their mirrored tilt;
- reduced-motion mode still changes expressions even though it suppresses the whole-body shake;
- the loading-screen mascot stays neutral beyond five seconds and remains non-interactive.

- [ ] **Step 9: Review the scoped diff and commit**

Run:

```bash
git diff --check -- web/components/ui/MenuCreature.tsx CLAUDE.md
git diff -- web/components/ui/MenuCreature.tsx CLAUDE.md
```

Confirm there is no new timer, CSS animation, alternate eye path, palette change, or loading-screen interaction.

Because both files contain pre-existing user changes, stage only the expression/documentation hunks:

```bash
git add -p web/components/ui/MenuCreature.tsx CLAUDE.md
git commit -m "feat: add tired and angry creature eyes"
```
