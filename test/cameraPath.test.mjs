import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { Journey, makeSample, normalizeDocument } from "../src/core/index.js";

/**
 * The camera's own route.
 *
 * Checkable here for the same reason the subject's path is: core has no React,
 * no DOM and no WebGL, so a whole flythrough can be swept in node. A camera
 * that jumps is the single most obvious defect in this kind of page and the
 * single hardest to catch by scrolling and watching.
 */

const base = {
  version: 1,
  lens: { z: 5.9, fov: 38, aspect: 1.6 },
  path: [
    { p: 0, sx: 0.5, y: 0, z: -1 },
    { p: 1, sx: -0.5, y: 0, z: -2 },
  ],
  beats: [
    { at: 0, fov: 30 },
    { at: 1, fov: 60 },
  ],
};

const route = [
  { p: 0, position: [0, 0, 6], target: [0, 0, 0], fov: 38 },
  { p: 0.4, position: [4, 2, 3], target: [1, 0, 0], fov: 50 },
  { p: 1, position: [-3, 1, 5], target: [0, 1, 0], fov: 38 },
];

describe("camera path", () => {
  test("a document without one reports so, rather than sitting at the origin", () => {
    const journey = new Journey(base);
    const out = makeSample();
    journey.sample(0.5, out);

    assert.equal(out.hasCameraPath, false);
    assert.equal(journey.sampleCameraPath(0.5), null);
  });

  test("the lens is AT each waypoint at that waypoint's progress", () => {
    const journey = new Journey({ ...base, cameraPath: route });

    // The whole point of binding to measured progress: a row is not an
    // ordinal, it is a promise about where the reader will be.
    for (const row of route) {
      const at = journey.sampleCameraPath(row.p);
      for (const axis of ["x", "y", "z"]) {
        assert.ok(
          Math.abs(at.position[axis] - row.position["xyz".indexOf(axis)]) < 1e-9,
          `position ${axis} at p=${row.p}`
        );
      }
      assert.ok(Math.abs(at.fov - row.fov) < 1e-9, `fov at p=${row.p}`);
    }
  });

  test("the lens never jumps", () => {
    const journey = new Journey({ ...base, cameraPath: route });
    const out = makeSample();

    let previous = null;
    let worst = 0;

    for (let p = 0; p <= 1; p += 0.0005) {
      journey.sample(p, out);
      if (previous) worst = Math.max(worst, out.cameraPath.position.distanceTo(previous));
      previous = out.cameraPath.position.clone();
    }

    // At 2000 steps across a route this size, a continuous curve moves well
    // under a hundredth of a unit per step. A cut would be orders larger.
    assert.ok(worst < 0.02, `largest step was ${worst}`);
  });

  test('mode "path" with nothing to fly is refused, not silently ignored', () => {
    assert.throws(
      () => normalizeDocument({ ...base, camera: { mode: "path" } }),
      /at least two cameraPath waypoints/
    );
  });

  test("a locked lens holds its fov instead of tracking the beats track", () => {
    // The beats track sweeps 30 -> 60 across the page. A locked camera must
    // ignore it: locked used to mean locked in position only, so an author who
    // had nailed the camera down still got a slow zoom they never asked for.
    const doc = normalizeDocument({ ...base, camera: { mode: "locked" } });
    assert.equal(doc.camera.fov, null, "null means the document's lens fov");

    const explicit = normalizeDocument({
      ...base,
      camera: { mode: "locked", fov: 42 },
    });
    assert.equal(explicit.camera.fov, 42);
  });
});
