# Rounded Snake Cells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every snake cell with an 8% corner radius and make the DOM text mask match that silhouette exactly, without changing the apple.

**Architecture:** Put the shared radius calculation and SVG rounded-rectangle path builder in `web/lib/board.ts`, alongside the pixel-snapped cell geometry already shared by canvas and DOM. The canvas renderer uses the same radius calculation with `CanvasRenderingContext2D.roundRect`, while `LitText` uses the SVG path builder for its `clip-path`.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, Canvas 2D, CSS `clip-path: path()`, Node.js built-in test runner

## Global Constraints

- The corner radius is exactly 8% of the cell's shorter side.
- The snake head and body use identical rounding.
- The canvas paint and DOM text mask use the same pixel-snapped bounds and radius calculation.
- Apple rendering, eyes, board geometry, game rules, state, and networking remain unchanged.

---

### Task 1: Shared rounded-cell geometry

**Files:**
- Modify: `web/lib/board.ts`
- Create: `web/test/board.test.mjs`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: cell pixel bounds expressed as `width` and `height` numbers.
- Produces: `snakeCellRadius(width: number, height: number): number` and `roundedRectPath(left: number, top: number, width: number, height: number, radius: number): string`.

- [ ] **Step 1: Add failing geometry tests**

Create `web/test/board.test.mjs` with Node's built-in test runner. Assert that `snakeCellRadius(50, 40)` returns `3.2`, that width/height order does not matter, and that `roundedRectPath(10, 20, 50, 40, 3.2)` returns a closed SVG path containing four radius-`3.2` arcs at the expected edges.

Add this script to `web/package.json`:

```json
"test": "node --test test/*.test.mjs"
```

- [ ] **Step 2: Run the tests and verify the intended failure**

Run: `npm test`

Expected: FAIL because `snakeCellRadius` and `roundedRectPath` are not exported by `lib/board.ts`.

- [ ] **Step 3: Implement the shared geometry**

Add to `web/lib/board.ts`:

```ts
export const SNAKE_CELL_RADIUS_RATIO = 0.08;

export function snakeCellRadius(width: number, height: number): number {
  return Math.min(width, height) * SNAKE_CELL_RADIUS_RATIO;
}

export function roundedRectPath(
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
): string {
  const right = left + width;
  const bottom = top + height;
  return [
    `M${left + radius} ${top}`,
    `H${right - radius}A${radius} ${radius} 0 0 1 ${right} ${top + radius}`,
    `V${bottom - radius}A${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `H${left + radius}A${radius} ${radius} 0 0 1 ${left} ${bottom - radius}`,
    `V${top + radius}A${radius} ${radius} 0 0 1 ${left + radius} ${top}Z`,
  ].join("");
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`

Expected: all geometry tests PASS.

### Task 2: Apply matching rounding to canvas and text mask

**Files:**
- Modify: `web/lib/renderer.ts`
- Modify: `web/components/game/LitText.tsx`

**Interfaces:**
- Consumes: `snakeCellRadius(width, height)` and `roundedRectPath(left, top, width, height, radius)` from Task 1.
- Produces: rounded snake paint on the canvas and a matching rounded DOM text clip; no new public interface.

- [ ] **Step 1: Update the canvas snake drawing**

Keep food on the existing `fillRect` path. Add a dedicated snake-cell method that begins a path, calls `ctx.roundRect(left, top, width, height, snakeCellRadius(width, height))`, and fills it. Call that method for every head and body cell.

- [ ] **Step 2: Update the DOM text mask**

In `LitText.tsx`, keep using `cellEdges()` for each cell's bounds. Replace each square path string with `roundedRectPath(...)`, passing the element-relative left/top coordinates and `snakeCellRadius(width, height)`.

- [ ] **Step 3: Run all frontend checks**

Run: `npm test && npm run typecheck && npm run lint`

Expected: tests, TypeScript, and ESLint all exit successfully with no errors.

- [ ] **Step 4: Review the diff against the approved scope**

Run: `git diff --check && git diff -- web/lib/board.ts web/lib/renderer.ts web/components/game/LitText.tsx web/test/board.test.mjs web/package.json`

Confirm that snake cells and the text mask changed, while the apple's `FOOD_INSET` and `fillCell` rendering remain unchanged.
