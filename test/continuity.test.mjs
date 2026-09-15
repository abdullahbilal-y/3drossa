import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Journey, makeSample } from "../src/core/index.js";

/**
 * Properties that could previously only be seen by watching a running page.
 *
 * These ran alongside a fidelity suite that held the document against a real
 * site's hand-written waypoint table. That suite is gone, and deliberately: the
 * site now reads the document, so the comparison was the document against
 * itself. It did its job — it proved the format could express a shipped site
 * exactly, which is what justified migrating the site onto it.
 *
 * What remains is what is still worth asserting: that a journey is continuous,
 * and that its station handoffs are exact.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

describe("continuity", () => {
  let journey;

  before(async () => {
    const doc = JSON.parse(
      await fs.readFile(path.join(here, "fixtures", "wiselab.journey.json"), "utf8")
    );
    journey = new Journey(doc);
  });

  /**
   * A teleport is a discontinuity in world position per unit of scroll. It was
   * the single most persistent bug in the site this came from, and it could
   * only be found by sampling a live page. Here it is an assertion.
   */
  test("the travel path never jumps", () => {
    const out = makeSample();
    const step = 0.001;

    journey.sample(0, out);
    const previous = out.travel.clone();
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
   * exactly at every boundary. This is what makes "derive, never duplicate" an
   * enforceable rule rather than a convention.
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

  /**
   * There is deliberately NO "waypoints must clear the text column" test.
   *
   * It was written, and it failed on correct data: a waypoint high in the frame
   * and well back in depth passes over copy quite happily, because height,
   * distance and per-section presence are doing the work instead. Keeping out
   * of the column is a guideline the editor makes visible, not an invariant —
   * and a test that fails on good authoring is worse than no test.
   */
});
