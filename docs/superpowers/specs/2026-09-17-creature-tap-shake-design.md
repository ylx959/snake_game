# Creature Tap Shake Design

## Goal

Make the main-menu favicon creature an interactive colour trigger. Pressing it starts one complete 1.5-second whole-body shake; when the shake finishes, the menu background advances exactly once and the creature changes to the paired Solo-style contrast colour while its eyes remain white.

## Interaction

- The creature is a real button operable by pointer, touch, Enter, and Space.
- Pointer activation begins on press. Releasing before 1.5 seconds does not cancel or shorten the animation.
- One activation always runs for exactly 1.5 seconds and advances the colour exactly once at completion.
- Further activations during those 1.5 seconds are ignored. They neither restart the shake nor queue additional colour changes.
- The automatic 5.6-second menu colour interval is removed. The menu background changes only after a creature shake completes.
- The creature keeps tracking the cursor and blinking while shaking. Pointer departure still eases the gaze back to neutral.

The button has an accessible action name independent of the visually hidden `Snake` page heading. Focus remains on the button throughout the animation. Its focus-visible state uses the existing hard-edged outline language; while a run is active it sets `aria-busy="true"` and uses a progress cursor without becoming disabled. Repeated activation is simply idempotent.

## Motion

The shake is a declared, deterministic pose sampled from local elapsed time:

- Duration: exactly 1.5 seconds.
- Motion: rapid horizontal translation plus a smaller synchronized rotation.
- Scope: an outer SVG group wraps the existing head, eyes, and blink groups, so the entire creature shakes as one body.
- Composition: the existing pointer-following head transform remains inside the shake group. Shake offsets are never mixed into `CreatureAim`, so the gaze target does not drift or jump when the shake begins or ends.
- End state: horizontal offset and rotation are both exactly zero at 1.5 seconds.

`web/lib/menuCreature.ts` owns a pure `shakePoseAt(localSeconds)` function and all shake constants. `MenuCreature.tsx` owns the activation timestamp and calls the pure sampler from its existing `requestAnimationFrame` loop. It detects the first frame at or beyond the duration, writes the neutral shake pose, and invokes the completion callback once.

This follows the `animating-svg-creatures` boundary: the component owns the clock, the framework-free module owns the maths, the pose is a pure function of local time, and the SVG retains one rendering path. No animation library, timeout-driven renderer, or CSS `animationend` synchronization is added.

## Colour Model

Each `MenuColor` gains a creature colour. The pair is explicit data rather than calculated at runtime, preserving separate interface and creature colour lineages.

| Menu background | Creature | Eyes |
|---|---|---|
| `#22DFF5` | `#FF4A1F` | `#FFFFFF` |
| `#4B2BEE` | `#FFE93D` | `#FFFFFF` |
| `#FF4A1F` | `#22DFF5` | `#FFFFFF` |
| `#3EE03E` | `#FF1B5E` | `#FFFFFF` |
| `#FF0CBA` | `#7BF53A` | `#FFFFFF` |
| `#FFE93D` | `#4B2BEE` | `#FFFFFF` |

These are the existing Solo palette relationships, including reversed pairs where the menu ground is a Solo foreground. The creature colour is passed as an explicit component prop and applied to the existing head rectangle. Both eye rectangles keep the literal white fill and never inherit a theme colour.

The current menu text `ink` choice remains unchanged and continues to control the lede and note. Button and card colours remain unchanged.

## State and Data Flow

1. The page-level menu colour hook stores the current colour index and returns the current `MenuColor` plus an `advance()` callback.
2. The hook no longer creates an interval or changes colour by itself.
3. `page.tsx` passes the current creature colour and `advance()` through `MenuScreen` to `MenuCreature`.
4. `MenuCreature` starts one local shake run when activated.
5. Its existing animation frame samples gaze, blink, and shake independently, then writes their transforms to nested SVG groups.
6. At the 1.5-second boundary, `MenuCreature` resets the shake group to its neutral transform, closes the active run, and calls `advance()` exactly once.
7. React applies the next background and creature colour together from the same `MenuColor`, so the pair cannot tear or become mismatched.

The animation component does not own the palette index, and the palette hook does not own animation time. Each unit has one responsibility and communicates through `color` and `onShakeComplete` props.

## Reduced Motion

The shake is decorative motion, so `prefers-reduced-motion: reduce` suppresses horizontal translation and rotation at runtime. The activation still enters a visible pressed/busy state, uses the same 1.5-second completion clock, and advances the colour exactly once. Cursor tracking and blinking remain enabled because they are the creature's ongoing life rather than the tap flourish.

## Failure and Lifecycle Behavior

- If the component unmounts during a shake, its animation frame and listeners are removed and no delayed colour change fires after unmount.
- A remount starts idle; an interrupted shake is not restored or completed off-screen.
- Non-finite elapsed values return the neutral shake pose.
- The completion callback is stored safely so a parent re-render does not restart the effect or cause a stale callback.
- No `setTimeout` controls the visual state. The animation frame clock is the single authority for both the pose and completion boundary.

## Files and Boundaries

- `web/lib/menuCreature.ts`: add pure shake constants, types, and sampler.
- `web/test/menuCreature.test.mjs`: test shake timing, alternating direction, bounds, neutral completion, and invalid time.
- `web/lib/palette.ts`: add explicit creature colours to `MenuColor` entries.
- `web/test/palette.test.mjs`: lock the six menu background/creature pairs.
- `web/hooks/useMenuPop.ts`: remove the interval and expose manual advancement.
- `web/components/ui/MenuCreature.tsx`: render the outer shake group, implement one-shot activation, accessibility, reduced-motion handling, and completion.
- `web/components/screens/MenuScreen.tsx`: pass creature colour and completion action into the component.
- `web/app/page.tsx`: connect the manual colour controller to `MenuScreen`.
- `web/app/globals.css`: add button reset, pointer/focus/active/busy styling without moving the SVG through a second animation system.
- `CLAUDE.md`: update the menu-colour and creature architecture notes so they no longer describe automatic cycling.

No backend, game palette progression, Solo gameplay, canvas renderer, protocol, or multiplayer behavior changes.

## Verification

- Unit tests prove the shake begins neutral, alternates left and right within its declared bounds, and returns exactly to neutral at 1.5 seconds and afterward.
- Palette tests prove every menu background has the intended paired creature colour.
- Frontend tests, TypeScript, ESLint, and the production build pass.
- Browser verification covers mouse press, early release, touch, Enter, Space, repeated presses, reduced motion, focus visibility, cursor tracking during the shake, exact one-step colour advancement, and absence of automatic colour changes after waiting longer than 5.6 seconds.
