import assert from "node:assert/strict";
import test from "node:test";

import { cellRoundedPath } from "../lib/board.ts";
import { END_RADIUS, SQUARE, cornersOf, endRadius, ends, headingFrom } from "../lib/snakeEnds.ts";

/** A snake running right to left: head at the right-hand end. */
const RUN = [
  [10, 5],
  [9, 5],
  [8, 5],
];

test("a body cell is square on every corner", () => {
  const snake = ends(RUN, "RIGHT");
  assert.deepEqual(cornersOf([9, 5], snake), SQUARE);
});

test("the head rounds its leading edge and nothing else", () => {
  // Heading RIGHT: the right-hand corners, so the join with the neck stays hard.
  assert.deepEqual(cornersOf([10, 5], ends(RUN, "RIGHT")), [false, true, true, false]);
  assert.deepEqual(cornersOf([10, 5], ends(RUN, "UP")), [true, true, false, false]);
});

test("the tail rounds away from the body, not along it", () => {
  // The body runs off to the right of the tail, so the tail's own end is left.
  assert.equal(headingFrom([9, 5], [8, 5]), "LEFT");
  assert.deepEqual(cornersOf([8, 5], ends(RUN, "RIGHT")), [true, false, false, true]);
});

test("a one-cell snake is its own head and tail, so it rounds completely", () => {
  const snake = ends([[4, 4]], "UP");
  assert.equal(snake.beforeTail, null);
  assert.deepEqual(cornersOf([4, 4], snake), [true, true, true, true]);
});

test("an end the fog has taken rounds nothing, so a cut is not a nose", () => {
  const snake = { head: null, direction: "RIGHT", tail: null, beforeTail: null };
  assert.deepEqual(cornersOf([10, 5], snake), SQUARE);
  assert.deepEqual(cornersOf([8, 5], snake), SQUARE);
});

test("the radius is whole pixels, and a small cell rounds to nothing", () => {
  // Derived from END_RADIUS, not pinned to it: the look is meant to be retuned
  // by that one number, and a test that hardcodes today's value only makes
  // turning the dial fail the build.
  assert.equal(endRadius(40, 40), Math.round(40 * END_RADIUS));
  assert.ok(Number.isInteger(endRadius(33, 33)), "never a fraction of a pixel");

  // The shorter side decides, so a cell that is not square cannot over-round.
  assert.equal(endRadius(40, 20), endRadius(20, 40));
  assert.equal(endRadius(40, 20), Math.round(20 * END_RADIUS));

  // Small enough and it gives up rather than chewing the corner.
  assert.equal(endRadius(1, 1), 0);
});

test("a cell with no rounded corner is exactly the plain rectangle", () => {
  // Body cells must keep sharing edges to the character, or the mask seams.
  assert.equal(cellRoundedPath(10, 20, 50, 40, 12, SQUARE), "M10 20H60V60H10Z");
  assert.equal(cellRoundedPath(10, 20, 50, 40, 0, [true, true, true, true]), "M10 20H60V60H10Z");
});

test("a rounded path arcs only where a corner is asked for", () => {
  assert.equal(
    cellRoundedPath(0, 0, 10, 10, 3, [false, true, true, false]),
    "M0 0H7A3 3 0 0 1 10 3V7A3 3 0 0 1 7 10H0V0Z",
  );
});

test("the radius can never exceed half the cell", () => {
  assert.equal(
    cellRoundedPath(0, 0, 10, 10, 99, [true, true, true, true]),
    "M5 0H5A5 5 0 0 1 10 5V5A5 5 0 0 1 5 10H5A5 5 0 0 1 0 5V5A5 5 0 0 1 5 0Z",
  );
});
