import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { Journey, makeSample } from "../src/core/index.js";
import { available, loadWiselab, WISELAB_DIR } from "./helpers/wiselab.mjs";

/**
 * Does the document format reproduce a real, shipped site — exactly?
 *
 * This is the gate on the whole engine. wiselab expresses its journey as
 * hand-written `lerp()` calls inside functions; 3drossa expresses it as
 * keyframe data. If the two disagree anywhere, the format is missing something
 * a real site needed, and the format changes — not the fixture.
 *
 * Everything here runs in node. No browser, no GPU, no screenshots. That is
 * the point: the site this was extracted from could only be checked by
 * instrumenting a running page.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Floating-point identity, not approximation.
 *
 * Both sides do the same arithmetic in the same order, so they should agree to
 * the last bit or two. A loose tolerance here would hide exactly the kind of
 * drift this test exists to catch — 1e-6 is already generous.
 */
const EPS = 1e-9;

const close = (actual, expected, what, at) =>
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `${what} at ${at}: engine ${actual} vs wiselab ${expected} (delta ${actual - expected})`
  );

describe("fidelity against wiselab", async () => {
  let journey;
  let wiselab;
  let doc;

  before(async () => {
    assert.ok(
      await available(),
      `wiselab not found at ${WISELAB_DIR}. Set WISELAB_DIR to the site's directory.`
    );
    wiselab = await loadWiselab();
    doc = JSON.parse(
      await fs.readFile(path.join(here, "fixtures", "wiselab.journey.json"), "utf8")
    );
    journey = new Journey(doc);
  });

  test("station subject framings match, keyframes vs lerp()", () => {
    for (const id of ["cocoon", "fork", "invitation"]) {
      const theirs = wiselab.journey.makeSubject();
      const ours = { sx: 0, y: 0, z: 0, scale: 1 };

      for (let t = 0; t <= 1; t += 0.001) {
        wiselab.journey.STATIONS[id].subject(t, theirs);
        journey.stationSubject(id, t, ours);

        for (const key of ["sx", "y", "z", "scale"]) {
          close(ours[key], theirs[key], `${id}.subject.${key}`, `t=${t.toFixed(3)}`);
        }
      }
    }
  });

  test("station camera framings match", () => {
    for (const id of ["cocoon", "fork", "invitation"]) {
      const theirs = wiselab.journey.makeFraming();
      const ours = {};

      for (let t = 0; t <= 1; t += 0.001) {
        wiselab.journey.STATIONS[id].camera(t, theirs);
        journey.stationCamera(id, t, ours);

        const at = `t=${t.toFixed(3)}`;
        close(ours.position[0], theirs.position.x, `${id}.camera.position.x`, at);
        close(ours.position[1], theirs.position.y, `${id}.camera.position.y`, at);
        close(ours.position[2], theirs.position.z, `${id}.camera.position.z`, at);
        close(ours.target[0], theirs.target.x, `${id}.camera.target.x`, at);
        close(ours.target[1], theirs.target.y, `${id}.camera.target.y`, at);
        close(ours.target[2], theirs.target.z, `${id}.camera.target.z`, at);
        close(ours.fov, theirs.fov, `${id}.camera.fov`, at);
      }
    }
  });

  test("station pinned lengths match", () => {
    for (const id of ["cocoon", "fork", "invitation"]) {
      assert.equal(
        journey.stations.get(id).scroll,
        wiselab.journey.STATIONS[id].scroll,
        `${id}.scroll`
      );
    }
  });

  test("screen-space conversion matches", () => {
    for (let z = -8; z <= 2; z += 0.1) {
      for (const sx of [-1, -0.5, 0, 0.62, 1]) {
        close(
          journey.toWorldX(sx, z),
          wiselab.flightPath.toWorldX(sx, z),
          "toWorldX",
          `sx=${sx} z=${z.toFixed(1)}`
        );
      }
    }
  });

  test("progress -> curve parameter matches", () => {
    for (let p = 0; p <= 1; p += 0.001) {
      close(
        journey.progressToU(p),
        wiselab.flightPath.progressToU(p),
        "progressToU",
        `p=${p.toFixed(3)}`
      );
    }
  });

  test("the travel path is the same curve, point for point", () => {
    const theirs = wiselab.flightPath.createFlightPath("base", false);
    const out = makeSample();
    const point = new THREE.Vector3();

    for (let p = 0; p <= 1; p += 0.001) {
      journey.sample(p, out);
      const u = wiselab.flightPath.progressToU(p);
      theirs.getPoint(u, point);

      const at = `p=${p.toFixed(3)}`;
      close(out.travel.x, point.x, "travel.x", at);
      close(out.travel.y, point.y, "travel.y", at);
      close(out.travel.z, point.z, "travel.z", at);
    }
  });

  test("global beats match", () => {
    const theirs = {};
    const out = makeSample();

    for (let p = 0; p <= 1; p += 0.001) {
      wiselab.flightPath.sampleBeats(p, theirs);
      journey.sample(p, out);

      const at = `p=${p.toFixed(3)}`;
      for (const key of ["scale", "camY", "camZ", "fov"]) {
        close(out.beats[key], theirs[key], `beats.${key}`, at);
      }
    }
  });
});

describe("continuity", async () => {
  let journey;

  before(async () => {
    const doc = JSON.parse(
      await fs.readFile(path.join(here, "fixtures", "wiselab.journey.json"), "utf8")
    );
    journey = new Journey(doc);
  });

  /**
   * The property `smooth.mjs` checks in a browser, checkable in CI.
   *
   * A teleport is a discontinuity in world position per unit of scroll. It was
   * the single most persistent bug in the site this came from, and it could
   * only be seen by sampling a live page. Here it is an assertion.
   */
  test("the travel path never jumps", () => {
    const out = makeSample();
    const step = 0.001;

    journey.sample(0, out);
    let previous = out.travel.clone();
    let worst = 0;
    let worstAt = 0;

    for (let p = step; p <= 1; p += step) {
      journey.sample(p, out);
      const distance = out.travel.distanceTo(previous);
      if (distance > worst) {
        worst = distance;
        worstAt = p;
      }
      previous.copy(out.travel);
    }

    // ~1.7 world units per 1% of scroll is the measured peak rate, as the
    // Invitation station takes hold. Per 0.1% that is ~0.17.
    assert.ok(
      worst < 0.25,
      `travel jumps ${worst.toFixed(4)} units in one 0.001 step at p=${worstAt.toFixed(3)}`
    );
  });

  /**
   * Station handoffs are derived, so the spline and the station must agree
   * exactly at every boundary. This is the assertion that makes the "derive,
   * never duplicate" rule enforceable rather than a convention.
   */
  test("the spline meets each station exactly at its boundaries", () => {
    for (const [id, range] of journey.ranges) {
      for (const [p, at] of [
        [range.from, 0],
        [range.to, 1],
      ]) {
        const framing = journey.stationSubject(id, at);
        const expected = {
          x: journey.toWorldX(framing.sx, framing.z),
          y: framing.y,
          z: framing.z,
        };

        const out = journey.sample(p);

        for (const axis of ["x", "y", "z"]) {
          assert.ok(
            Math.abs(out.travel[axis] - expected[axis]) < 1e-6,
            `${id} handoff at p=${p} (t=${at}): travel.${axis} ${out.travel[axis]} ` +
              `vs station ${expected[axis]}`
          );
        }
      }
    }
  });
});
