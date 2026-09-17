import assert from "node:assert/strict";
import test from "node:test";

import { IntervalLog } from "../lib/netstats.ts";

test("one event is not a gap", () => {
  const log = new IntervalLog();
  assert.equal(log.stats(), null);

  log.record(1000);
  assert.equal(log.stats(), null, "a first event only starts the clock");

  log.record(1120);
  assert.equal(log.stats().count, 1);
});

test("an even beat has no jitter, and a ragged one does", () => {
  const even = new IntervalLog();
  for (let index = 0; index <= 20; index += 1) even.record(index * 120);

  const even120 = even.stats();
  assert.equal(even120.mean, 120);
  assert.equal(even120.p50, 120);
  assert.equal(even120.jitter, 0);

  const ragged = new IntervalLog();
  let now = 0;
  for (const gap of [120, 60, 180, 90, 150, 120, 200, 40]) {
    now += gap;
    ragged.record(now);
  }

  const stats = ragged.stats();
  assert.equal(stats.count, 7, "eight gaps, minus the one that only starts the clock");
  assert.ok(stats.jitter > 40, `jitter came out at ${stats.jitter}`);
  assert.equal(stats.max, 200);
  // Nearest-rank, so p95 of seven samples is the largest of them.
  assert.equal(stats.p95, 200);
});

test("a reset forgets the run before it", () => {
  const log = new IntervalLog();
  log.record(0);
  log.record(120);
  log.reset();

  assert.equal(log.stats(), null);
  log.record(10_000);
  assert.equal(log.stats(), null, "and the gap across the reset is not a measurement");
});
