import assert from "node:assert/strict";
import test from "node:test";

import { cellRectPath } from "../lib/board.ts";

test("a cell path closes around all four edges", () => {
  assert.equal(cellRectPath(10, 20, 50, 40), "M10 20H60V60H10Z");
});

test("neighbouring cells share an edge exactly, so they leave no seam", () => {
  // The mask is one `path()` of many cells; two that touch must agree on the
  // boundary between them or a hairline of the wrong colour shows through.
  assert.equal(cellRectPath(0, 0, 10, 10), "M0 0H10V10H0Z");
  assert.equal(cellRectPath(10, 0, 10, 10), "M10 0H20V10H10Z");
});
