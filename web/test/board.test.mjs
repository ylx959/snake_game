import assert from "node:assert/strict";
import test from "node:test";

import { roundedRectPath, snakeCellRadius } from "../lib/board.ts";

test("snake cell radius scales from the shorter side", () => {
  assert.equal(snakeCellRadius(50, 40), 6);
  assert.equal(snakeCellRadius(40, 50), 6);
  assert.equal(snakeCellRadius(25, 20), 3);
});

test("rounded rectangle path follows all four cell edges with equal corner arcs", () => {
  assert.equal(
    roundedRectPath(10, 20, 50, 40, 3.2),
    "M13.2 20H56.8A3.2 3.2 0 0 1 60 23.2V56.8A3.2 3.2 0 0 1 56.8 60H13.2A3.2 3.2 0 0 1 10 56.8V23.2A3.2 3.2 0 0 1 13.2 20Z",
  );
});
