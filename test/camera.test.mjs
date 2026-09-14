import { test, describe } from "node:test";
import assert from "node:assert/strict";

/**
 * The camera must not feed its own offset back into itself.
 *
 * This reproduces, in pure arithmetic, a bug that could otherwise only be
 * described as "the camera shakes when it reaches a station". It is not a
 * rendering problem and it needs no browser: it is the shape of the update.
 *
 *   WRONG                                  RIGHT
 *   position.lerp(target, ease)            position.lerp(target + offset, ease)
 *   position.x += offset
 *
 * In the wrong version the offset is added to a value that already contains
 * last frame's offset, so it accumulates until the damping bleeds it off as
 * fast as it arrives. Solving x = x(1-e) + Te + p gives x = T + p/e — the
 * offset is amplified by 1/ease, which at 60fps and a damping of 4.5 is about
 * fourteen times.
 *
 * The amplification alone would just be too much parallax. What makes it SHAKE
 * is that `ease` is a function of frame time, so the resting position moves
 * every time a frame takes slightly longer — and it is worst when the camera is
 * otherwise still, which is exactly what a station does.
 */

const ease = (damping, dt) => 1 - Math.exp(-damping * dt);

/** Alternating frame times: a 60fps display that occasionally misses. */
function* frames(count) {
  for (let i = 0; i < count; i++) yield i % 3 === 0 ? 1 / 40 : 1 / 60;
}

function run(update, { damping = 4.5, offset = 0.125, target = 0, count = 400 } = {}) {
  let x = target;
  const settled = [];

  let i = 0;
  for (const dt of frames(count)) {
    x = update(x, target, offset, ease(damping, dt));
    // Ignore the approach; only the resting behaviour matters.
    if (i++ > count * 0.6) settled.push(x);
  }

  return {
    mean: settled.reduce((a, b) => a + b, 0) / settled.length,
    spread: Math.max(...settled) - Math.min(...settled),
  };
}

const feedback = (x, target, offset, e) => x + (target - x) * e + offset;
const applied = (x, target, offset, e) => x + (target + offset - x) * e;

describe("camera offsets", () => {
  test("adding the offset after damping amplifies it by 1/ease", () => {
    const { mean } = run(feedback);

    // ~14x at 60fps. Assert it is wildly wrong, not the precise figure.
    assert.ok(
      mean > 0.125 * 5,
      `expected runaway amplification, got ${mean.toFixed(4)} for an offset of 0.125`
    );
  });

  test("...and makes the resting position depend on frame time", () => {
    const { spread } = run(feedback);

    // This is the shake: the camera never settles, because every longer frame
    // moves where "settled" is.
    assert.ok(
      spread > 0.01,
      `expected frame-time-dependent drift, got a spread of ${spread.toFixed(5)}`
    );
  });

  test("damping toward target + offset applies it exactly once", () => {
    const { mean, spread } = run(applied);

    assert.ok(
      Math.abs(mean - 0.125) < 1e-6,
      `expected the camera to rest at the offset, got ${mean.toFixed(6)}`
    );
    assert.ok(
      spread < 1e-9,
      `expected a still camera regardless of frame time, got ${spread.toExponential(2)}`
    );
  });
});
