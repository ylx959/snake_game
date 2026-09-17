import assert from "node:assert/strict";
import test from "node:test";

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

test("the mascot centre is a neutral target", () => {
  assert.deepEqual(normalizeCreatureAim(500, 300, 500, 300, 500, 300), { x: 0, y: 0 });
});

test("viewport edges map to signed unit targets and clamp beyond them", () => {
  assert.deepEqual(normalizeCreatureAim(0, 0, 500, 300, 500, 300), { x: -1, y: -1 });
  assert.deepEqual(normalizeCreatureAim(1200, 900, 500, 300, 500, 300), { x: 1, y: 1 });
});

test("invalid geometry never enters the creature state", () => {
  assert.equal(normalizeCreatureAim(1, 1, 0, 0, 0, 100), null);
  assert.equal(normalizeCreatureAim(Number.NaN, 1, 0, 0, 100, 100), null);
});

test("smoothing is stable across different frame sizes", () => {
  const start = { x: 0, y: 0 };
  const target = { x: 1, y: -1 };
  const oneFrame = approachCreatureAim(start, target, 1 / 30);
  const halfA = approachCreatureAim(start, target, 1 / 60);
  const halfB = approachCreatureAim(halfA, target, 1 / 60);
  assert.ok(Math.abs(oneFrame.x - halfB.x) < 1e-12);
  assert.ok(Math.abs(oneFrame.y - halfB.y) < 1e-12);
});

test("eyes travel farther than the head without exceeding declared limits", () => {
  const pose = creaturePose({ x: 1, y: -1 });
  assert.deepEqual(pose, {
    headX: 1.8,
    headY: -1.35,
    headRotation: 3.2,
    eyeX: 3.6,
    eyeY: -2.7,
  });
});

test("blink sampling is deterministic and reopens fully", () => {
  assert.equal(blinkScaleAt(0), 1);
  assert.equal(blinkScaleAt(4.12), blinkScaleAt(4.12));
  assert.ok(blinkScaleAt(4.12) < 0.2);
  assert.equal(blinkScaleAt(4.4), 1);
});

test("a shake starts and finishes at the neutral whole-body pose", () => {
  assert.equal(SHAKE_DURATION_SECONDS, 1.5);
  assert.deepEqual(shakePoseAt(0), { x: 0, rotation: 0 });
  assert.deepEqual(shakePoseAt(1.5), { x: 0, rotation: 0 });
  assert.deepEqual(shakePoseAt(2), { x: 0, rotation: 0 });
  assert.equal(shakeCompleteAt(1.499), false);
  assert.equal(shakeCompleteAt(1.5), true);
});

test("the body alternates left and right during the run", () => {
  const right = shakePoseAt(SHAKE_DURATION_SECONDS / 36);
  const left = shakePoseAt((SHAKE_DURATION_SECONDS * 3) / 36);
  assert.ok(right.x > 0 && right.rotation > 0);
  assert.ok(left.x < 0 && left.rotation < 0);
});

test("the whole shake stays within its declared travel", () => {
  for (let frame = 0; frame <= 180; frame += 1) {
    const pose = shakePoseAt(frame / 120);
    assert.ok(Math.abs(pose.x) <= 3.2 + 1e-12);
    assert.ok(Math.abs(pose.rotation) <= 4.5 + 1e-12);
  }
});

test("reduced motion and invalid time produce a neutral pose", () => {
  assert.deepEqual(shakePoseAt(0.4, true), { x: 0, rotation: 0 });
  assert.deepEqual(shakePoseAt(Number.NaN), { x: 0, rotation: 0 });
  assert.deepEqual(shakePoseAt(Number.POSITIVE_INFINITY), { x: 0, rotation: 0 });
  assert.equal(shakeCompleteAt(Number.NaN), false);
});

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
