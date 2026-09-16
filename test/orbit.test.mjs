import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { Journey, makeSample, normalizeDocument } from "../src/core/index.js";

/**
 * The product shot: a subject that stands still and a lens that circles it.
 *
 * This is the case a downloaded model is usually wanted for — a car, a shoe, a
 * device — and it is the one a path-only engine expresses worst. Both halves
 * are asserted here because both are ways for a thing that should not move to
 * move.
 */

const base = {
  version: 1,
  lens: { z: 6, fov: 38, aspect: 1.6 },
  path: [
    { p: 0, sx: 0.5, y: 0, z: -1 },
    { p: 1, sx: -0.5, y: 2, z: -4 },
  ],
  beats: [{ at: 0, fov: 38 }],
};

describe("a fixed subject", () => {
  test("does not move, at any point in the scroll", () => {
    const journey = new Journey({
      ...base,
      subject: { mode: "fixed", position: [0.4, -0.2, 1.5] },
    });
    const out = makeSample();

    for (let p = 0; p <= 1; p += 0.01) {
      journey.sample(p, out);
      assert.deepEqual(
        out.travel.toArray().map((n) => Number(n.toFixed(6))),
        [0.4, -0.2, 1.5],
        `moved at p=${p.toFixed(2)}`
      );
    }
  });

  test("has no direction of travel to turn toward", () => {
    // Heading is taken from the same point as the position, so useSubject finds
    // nothing to aim at and `subject.rotation` is the whole orientation.
    const journey = new Journey({ ...base, subject: { mode: "fixed", position: [1, 0, 0] } });
    const out = makeSample();
    journey.sample(0.5, out);

    assert.equal(out.travel.distanceTo(out.heading), 0);
  });

  test("is not dragged to a station's framing", () => {
    // A station still pins the page and still frames the camera — but it must
    // not move a subject the author pinned in place.
    const journey = new Journey({
      ...base,
      subject: { mode: "fixed", position: [0, 0, 0] },
      stations: [
        {
          id: "hold",
          scroll: 2,
          camera: [{ t: 0, position: [0, 0, 4], target: [0, 0, 0], fov: 30 }],
          subject: [
            { t: 0, sx: 0.9, y: 3, z: 2, scale: 2 },
            { t: 1, sx: -0.9, y: -3, z: -2, scale: 0.2 },
          ],
        },
      ],
      path: [
        { p: 0, sx: 0.5, y: 0, z: -1 },
        { p: 0.4, station: "hold", at: 0 },
        { p: 0.7, station: "hold", at: 1 },
        { p: 1, sx: -0.5, y: 2, z: -4 },
      ],
    });

    const out = makeSample();
    journey.sample(0.55, out);

    assert.equal(out.station, "hold", "the station should still be reported");
    assert.equal(out.camera.fov, 30, "the station should still frame the camera");
    assert.deepEqual(out.subjectWorld.toArray(), [0, 0, 0], "the subject was moved");
  });
});

describe("an orbiting camera", () => {
  const orbit = [
    { p: 0, azimuth: 0, elevation: 0, distance: 5, fov: 38 },
    { p: 1, azimuth: 90, elevation: 0, distance: 5, fov: 50 },
  ];

  test("azimuth 0 is straight in front, on +Z", () => {
    const journey = new Journey({ ...base, orbit });
    const at = journey.sampleOrbit(0);

    assert.ok(Math.abs(at.offset.x) < 1e-9);
    assert.ok(Math.abs(at.offset.y) < 1e-9);
    assert.ok(Math.abs(at.offset.z - 5) < 1e-9);
  });

  test("holds its distance the whole way round", () => {
    // The defect this exists to prevent: an orbit hand-written as xyz drifts
    // off the radius, and the model lurches toward and away from the lens.
    const journey = new Journey({ ...base, orbit });
    const out = makeSample();

    for (let p = 0; p <= 1; p += 0.005) {
      journey.sample(p, out);
      assert.ok(
        Math.abs(out.orbit.offset.length() - 5) < 1e-9,
        `radius was ${out.orbit.offset.length()} at p=${p.toFixed(3)}`
      );
    }
  });

  test("elevation lifts the lens without changing the distance", () => {
    const journey = new Journey({
      ...base,
      orbit: [{ p: 0, azimuth: 0, elevation: 90, distance: 4 }],
    });
    const at = journey.sampleOrbit(0);

    assert.ok(Math.abs(at.offset.y - 4) < 1e-9, "straight overhead");
    assert.ok(at.offset.length() - 4 < 1e-9);
  });

  test("one waypoint is a perfectly good shot", () => {
    // A fixed camera at an authored angle. Requiring two would force an author
    // to duplicate a row to say "hold here".
    const doc = normalizeDocument({
      ...base,
      camera: { mode: "orbit" },
      orbit: [{ p: 0, azimuth: 35, elevation: 12, distance: 6 }],
    });
    assert.equal(doc.orbit.length, 1);
  });

  test("the mode is refused with nothing to orbit", () => {
    assert.throws(
      () => normalizeDocument({ ...base, camera: { mode: "orbit" } }),
      /at least one orbit waypoint/
    );
  });
});
