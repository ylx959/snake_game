import assert from "node:assert/strict";
import test from "node:test";

import {
  ENEMY_VISIBILITY_RADIUS_CELLS,
  LIGHT_CORE_RADIUS_CELLS,
  MAX_VEIL_ALPHA,
  VEIL_OUTER_RADIUS_CELLS,
  applyFog,
  isCellVisibleFrom,
  soloFocus,
  visionFocus,
} from "../lib/vision.ts";

/** Where our own head is in every case below. */
const HEAD = [10, 10];

const ME = "me";
const THEM = "them";

function snake(player_id, cells, alive = true) {
  return {
    player_id,
    nickname: player_id,
    color: player_id === ME ? 0 : 1,
    alive,
    score: 0,
    direction: "RIGHT",
    cells,
  };
}

function board(snakes, food = []) {
  return {
    code: "ABC234",
    width: 64,
    height: 36,
    status: "running",
    ticks: 1,
    palette: 0,
    food,
    snakes,
    alive: snakes.filter((s) => s.alive).length,
    total: snakes.length,
  };
}

/** The opponent in a fogged board, whoever else is on it. */
function themIn(fogged) {
  return fogged.snakes.find((s) => s.player_id === THEM);
}

const cellsOf = (fogged, id) => fogged.snakes.find((s) => s.player_id === id).cells;

// --- the cull -------------------------------------------------------------

test("an opponent cell inside the radius is drawn", () => {
  assert.equal(isCellVisibleFrom([13, 10], HEAD, ENEMY_VISIBILITY_RADIUS_CELLS), true);

  const fogged = applyFog(board([snake(ME, [HEAD]), snake(THEM, [[13, 10]])]), ME);
  assert.deepEqual(cellsOf(fogged, THEM), [[13, 10]]);
});

test("a cell exactly on the radius is drawn - the boundary is inside", () => {
  // Straight out: 5 cells dead on.
  assert.equal(isCellVisibleFrom([15, 10], HEAD, ENEMY_VISIBILITY_RADIUS_CELLS), true);
  // And on the diagonal, where 3-4-5 lands exactly on it.
  assert.equal(isCellVisibleFrom([13, 14], HEAD, ENEMY_VISIBILITY_RADIUS_CELLS), true);

  const fogged = applyFog(board([snake(ME, [HEAD]), snake(THEM, [[15, 10], [13, 14]])]), ME);
  assert.deepEqual(cellsOf(fogged, THEM), [[15, 10], [13, 14]]);
});

test("a cell outside the radius is not drawn at all, not merely faint", () => {
  assert.equal(isCellVisibleFrom([16, 10], HEAD, ENEMY_VISIBILITY_RADIUS_CELLS), false);

  // Absent from the board, rather than present with a small opacity: this file
  // decides existence, and the spotlight decides brightness.
  const fogged = applyFog(board([snake(ME, [HEAD]), snake(THEM, [[16, 10]])]), ME);
  assert.deepEqual(cellsOf(fogged, THEM), []);
});

test("the three radii are three, and in order", () => {
  // The light's core is well inside where opponents vanish, and the shadow goes
  // on darkening well past it. Collapsing any two of these back together is
  // what drew a ring: the fade had no room, and the opponents blinked out on
  // exactly the line it left.
  assert.ok(LIGHT_CORE_RADIUS_CELLS < ENEMY_VISIBILITY_RADIUS_CELLS);
  assert.ok(ENEMY_VISIBILITY_RADIUS_CELLS < VEIL_OUTER_RADIUS_CELLS);
  assert.ok(MAX_VEIL_ALPHA > 0 && MAX_VEIL_ALPHA < 1, "the far board dims, never vanishes");
});

test("how far the light reaches has no say in how far you can see", () => {
  // Everything from here to VEIL_OUTER_RADIUS_CELLS is still inside the fade,
  // and every cell of it past ENEMY_VISIBILITY_RADIUS_CELLS is still culled.
  // The only number that decides is the opponents' own.
  for (let away = ENEMY_VISIBILITY_RADIUS_CELLS + 1; away <= VEIL_OUTER_RADIUS_CELLS; away += 1) {
    const cell = [HEAD[0] + away, HEAD[1]];
    const fogged = applyFog(board([snake(ME, [HEAD]), snake(THEM, [cell])]), ME);
    assert.deepEqual(cellsOf(fogged, THEM), [], `expected a cull ${away} cells out`);
  }

  // And inside it, an opponent is drawn however dark the veil has grown there.
  const near = [HEAD[0] + ENEMY_VISIBILITY_RADIUS_CELLS, HEAD[1]];
  const lit = applyFog(board([snake(ME, [HEAD]), snake(THEM, [near])]), ME);
  assert.deepEqual(cellsOf(lit, THEM), [near]);
});

test("your own snake is never culled, however long it gets", () => {
  const tail = [
    HEAD,
    [11, 10],
    [12, 10],
    [30, 25], // far past VEIL_OUTER_RADIUS_CELLS, and still on the board
  ];
  const fogged = applyFog(board([snake(ME, tail), snake(THEM, [[40, 30]])]), ME);

  // Whole. The shadow darkens that far cell; the fog does not remove it.
  assert.deepEqual(cellsOf(fogged, ME), tail);
  assert.deepEqual(fogged.snakes.find((s) => s.player_id === ME).head, HEAD);
});

test("an opponent whose head is hidden gets no eyes", () => {
  // Body reaching into view, head still outside it.
  const them = snake(THEM, [
    [17, 10], // head, 7 cells away
    [16, 10],
    [15, 10], // body, exactly on the boundary
  ]);
  const fogged = applyFog(board([snake(ME, [HEAD]), them]), ME);

  assert.equal(themIn(fogged).head, null);
  assert.deepEqual(themIn(fogged).cells, [[15, 10]]);
});

test("an opponent whose head is in view keeps its eyes", () => {
  const fogged = applyFog(board([snake(ME, [HEAD]), snake(THEM, [[13, 10], [14, 10]])]), ME);

  assert.deepEqual(themIn(fogged).head, [13, 10]);
});

test("apples are never culled, however far away they are", () => {
  const far = [60, 34];
  const fogged = applyFog(board([snake(ME, [HEAD]), snake(THEM, [[40, 30]])], [far, [11, 11]]), ME);

  assert.deepEqual(fogged.food, [far, [11, 11]]);
  assert.equal(isCellVisibleFrom(far, HEAD, ENEMY_VISIBILITY_RADIUS_CELLS), false);
});

test("a spectator gets the whole board back", () => {
  const dead = snake(ME, [], false);
  const them = snake(THEM, [[40, 30], [41, 30]]);

  assert.equal(visionFocus([dead, them], ME), null);

  const fogged = applyFog(board([dead, them]), ME);
  assert.deepEqual(themIn(fogged).cells, [[40, 30], [41, 30]]);
  assert.deepEqual(themIn(fogged).head, [40, 30]);
});

test("a dead opponent is off the board entirely", () => {
  const fogged = applyFog(board([snake(ME, [HEAD]), snake(THEM, [], false)]), ME);
  assert.equal(themIn(fogged), undefined);
});

// --- where the light sits -------------------------------------------------

function solo(status, snake = [HEAD, [9, 10], [8, 10]]) {
  return {
    width: 48,
    height: 27,
    status,
    score: 0,
    ticks: 0,
    snake,
    direction: "RIGHT",
    food: null,
    palette: 0,
  };
}

test("only a moving snake gets a spotlight", () => {
  assert.deepEqual(soloFocus(solo("running")), HEAD);
});

test("a run that is not moving gets its whole board back", () => {
  // Standing on READY you are still reading the board, PAUSED you have stopped
  // playing, and GAME_OVER is a record. The dark is the difficulty, and it only
  // applies while the game is being played.
  for (const status of ["ready", "paused", "game_over"]) {
    assert.equal(soloFocus(solo(status)), null, `expected no spotlight when ${status}`);
  }
});

test("the light follows the head alone, not the body", () => {
  // Move only the head; the light must move exactly with it.
  const moved = [[4, 20], HEAD, [9, 10]];
  assert.deepEqual(soloFocus(solo("running", moved)), [4, 20]);

  const fogged = applyFog(board([snake(ME, moved), snake(THEM, [[6, 20]])]), ME);
  // The opponent is two cells from the *head*, so it is drawn - the body
  // trailing away across the board casts no light of its own.
  assert.deepEqual(cellsOf(fogged, THEM), [[6, 20]]);

  const behind = applyFog(board([snake(ME, moved), snake(THEM, [[11, 10]])]), ME);
  // Right beside the body, far from the head: not drawn.
  assert.deepEqual(cellsOf(behind, THEM), []);
});
