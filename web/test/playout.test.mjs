import assert from "node:assert/strict";
import test from "node:test";

import { BUFFER_MS, DEFAULT_PERIOD_MS, Playout } from "../lib/playout.ts";

/** The server's beat, and the clock the browser draws on. */
const PERIOD = 120;
const FRAME = 8;

/**
 * Run a whole round through the buffer: arrivals at the given times, a display
 * clock ticking every `FRAME` ms, and the moments a frame actually came out.
 */
function play(arrivals, until) {
  const buffer = new Playout();
  const shown = [];
  let next = 0;

  for (let now = 0; now <= until; now += FRAME) {
    while (next < arrivals.length && arrivals[next] <= now) {
      buffer.push(next, arrivals[next]);
      next += 1;
    }
    for (const frame of buffer.due(now)) shown.push({ frame, at: now });
  }

  return shown;
}

const gapsOf = (times) => times.slice(1).map((time, index) => time - times[index]);
const spread = (values) => Math.max(...values) - Math.min(...values);

test("a frame is held for the buffer, then shown", () => {
  const buffer = new Playout();
  buffer.push("a", 1000);

  assert.deepEqual(buffer.due(1000), []);
  assert.deepEqual(buffer.due(1000 + BUFFER_MS - 1), []);
  assert.deepEqual(buffer.due(1000 + BUFFER_MS), ["a"]);
});

test("a ragged arrival becomes an even beat", () => {
  // The thing this whole file exists for: arrivals that wander by tens of
  // milliseconds, coming out on a beat the display clock's own 8ms is the only
  // thing left wobbling.
  const jitter = [0, 34, -29, 18, -35, 27, -12, 31, -24, 9, 22, -31, 15, -18, 28, -9];
  const arrivals = jitter.map((offset, index) => 500 + index * PERIOD + offset);

  const shown = play(arrivals, 500 + arrivals.length * PERIOD + 400);
  const at = shown.map((entry) => entry.at);

  assert.equal(shown.length, arrivals.length, "every frame is shown exactly once");
  assert.deepEqual(
    shown.map((entry) => entry.frame),
    arrivals.map((_, index) => index),
    "and in the order it arrived",
  );

  // The arrivals really were ragged, and what came out really is not.
  assert.ok(spread(gapsOf(arrivals)) > 60, "the test data has to be jittery to prove anything");
  assert.ok(
    spread(gapsOf(at)) <= 2 * FRAME,
    `display gaps still spread by ${spread(gapsOf(at))}ms`,
  );
});

test("the beat is measured from the arrivals, ignoring stalls and bursts", () => {
  const buffer = new Playout();
  assert.equal(buffer.period, DEFAULT_PERIOD_MS, "the default holds until there is a measurement");

  // Arrivals wandering either side of a 95ms beat: each gap is wrong and the
  // average of them is right, which is the whole reason it is an average.
  const wobble = [0, 20, -18, 25, -22, 14, -25, 19, -11, 16, -20, 0];
  let now = 0;
  wobble.forEach((offset, index) => buffer.push(index, index * 95 + offset));
  now = 95 * (wobble.length - 1);
  assert.equal(Math.round(buffer.period), 95);

  // A second of nothing, then two frames in the same millisecond: neither is
  // the server's beat, and neither is allowed to move the estimate.
  now += 1200;
  buffer.push("after a stall", now);
  buffer.push("a burst", now + 1);
  assert.equal(Math.round(buffer.period), 95);
});

test("a backlog is played out faster than it arrived", () => {
  // Five frames at once - a tab handed back the foreground, or a stalled
  // connection letting go. Playing them at one per period would leave the
  // board half a second behind for the rest of the round.
  const shown = play([0, 0, 0, 0, 0], 600);

  assert.equal(shown.length, 5);
  assert.ok(
    shown[4].at < 5 * PERIOD,
    `the backlog took ${shown[4].at}ms, which is no faster than it arrived`,
  );
});

test("a frame that missed its slot goes out at once, and rebuilds the cushion", () => {
  const buffer = new Playout();

  buffer.push("a", 0);
  assert.deepEqual(buffer.due(BUFFER_MS), ["a"]);

  // A second of nothing. Holding this one back would add delay to a board that
  // is already behind, so it goes out on sight.
  buffer.push("b", 1000);
  assert.deepEqual(buffer.due(1000), ["b"]);

  // And the slack is back: the next frame, arriving a period later as if
  // nothing had happened, waits for a slot rather than being shown on arrival.
  buffer.push("c", 1000 + DEFAULT_PERIOD_MS);
  assert.deepEqual(buffer.due(1000 + DEFAULT_PERIOD_MS), []);
  assert.deepEqual(buffer.due(1000 + BUFFER_MS + DEFAULT_PERIOD_MS), ["c"]);
});

test("a tab that was away comes back to the present, not to a history of it", () => {
  const buffer = new Playout();

  // Nothing drained the queue for a minute - a hidden tab gets no frames to
  // draw on - and the board is still ticking away on the server.
  for (let index = 0; index < 500; index += 1) buffer.push(index, index * 120);

  const away = 499 * 120;
  assert.ok(buffer.depth <= 12, `${buffer.depth} frames of a finished minute are waiting`);

  // Coming back: a handful of frames, not a minute of them, and the board is
  // the present within a few frames of the display clock.
  const shown = [];
  for (let now = away; now <= away + 500; now += 8) shown.push(...buffer.due(now));

  assert.ok(shown.length <= 12, `${shown.length} frames played back`);
  assert.equal(shown[shown.length - 1], 499, "and it ends on the board as it is now");
});

test("a flush hands back everything waiting, in order, and stops the beat", () => {
  const buffer = new Playout();
  buffer.push("a", 0);
  buffer.push("b", 120);

  assert.deepEqual(buffer.flush(), ["a", "b"]);
  assert.equal(buffer.depth, 0);
  // Nothing is left scheduled: a message that flushed the queue is the next
  // thing the screen sees, and no stale frame may arrive behind it.
  assert.deepEqual(buffer.due(10_000), []);
});

test("a reset drops the queue and the measurement with it", () => {
  const buffer = new Playout();
  for (let index = 0; index < 10; index += 1) buffer.push(index, index * 95);

  buffer.reset();

  assert.equal(buffer.depth, 0);
  assert.equal(buffer.period, DEFAULT_PERIOD_MS);
  assert.deepEqual(buffer.due(10_000), []);
});
