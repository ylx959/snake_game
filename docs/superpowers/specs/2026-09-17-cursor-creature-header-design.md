# Cursor Creature Header Design

## Goal

Replace the main menu's visible `Snake` chromatic heading with an enlarged version of the existing favicon whose head and eyes smoothly follow the pointer.

## Visual Design

- Preserve the favicon's exact visual vocabulary: one black rounded-square head and two tall white capsule eyes.
- Render the mascot as a self-contained inline SVG in the heading position.
- Remove the visible `Snake` word, its RGB split, and the colour-change jolt. Keep an accessible `h1` named `Snake` without rendering the word visually.
- Keep the existing menu colour cycle, lede, controls, spacing system, and all non-menu uses of `ChromaticText` unchanged.
- Size the mascot from `--cell` with a pixel minimum, so it scales with the existing fixed-ratio stage.

## Motion

- Normalize the pointer against the viewport on both axes. The pointer at the mascot's centre is neutral; each viewport edge maps to a clamped target in `[-1, 1]`.
- Move and rotate the head only slightly. Move the eyes farther in the same direction so the gaze reads before the head motion does.
- Smooth the target with a frame-rate-independent exponential approach. The React component owns `requestAnimationFrame`; framework-free functions calculate every pose.
- Reject zero-sized and non-finite geometry before it reaches the animation state.
- Ignore touch pointers because a lifted finger leaves no persistent cursor target.
- On `pointerleave`, return to a neutral target smoothly rather than snapping.
- Add a deterministic blink sampled from elapsed seconds. Blinking remains active under `prefers-reduced-motion`, because it is the creature's life rather than decorative page motion.

These rules are adapted from the `animating-svg-creatures` skill: the clock stays at the component boundary, pose calculations remain pure, both axes use absolute targets, invalid targets are rejected, and the SVG has one rendering path.

## Architecture

### `web/lib/menuCreature.ts`

A framework-free animation module. It owns the constants and pure functions for pointer normalization, target smoothing, pose projection, and blink sampling. It imports no React APIs and reads no DOM globals.

### `web/components/ui/MenuCreature.tsx`

A client component that owns the SVG element, pointer listeners, animation-frame clock, and mutable current/target values. Each frame calls the pure animation module and writes transforms to the SVG groups. The component removes every listener and animation frame when it unmounts.

### Menu integration

`MenuScreen` places the creature inside the main `h1`, removes the visible title and the `beat` prop, and preserves the accessible heading name. `useMenuPop` continues changing the menu background but stops producing the obsolete animation-restart beat. `page.tsx` consumes only its colour.

## Accessibility and Constraints

- The page retains one level-one heading with accessible name `Snake`.
- The decorative SVG is hidden from assistive technology so the name is not announced twice.
- No new runtime or test dependency is added.
- `ChromaticText` and its general CSS remain because the Solo Game Over score still uses them.
- Game rules, networking, canvas rendering, menus below the home view, and favicon metadata do not change.

## Verification

- Unit-test pointer normalization, clamping, invalid geometry rejection, frame-rate-independent convergence, pose limits, and blink determinism.
- Run all frontend tests, TypeScript, ESLint, and a production build.
- In a browser, verify centre, four corners, pointer exit, touch behavior, menu colour changes, narrow viewport sizing, and cleanup after navigating away from the home view.

