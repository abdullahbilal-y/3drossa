/**
 * Easings, by name, so a document can say how a segment moves.
 *
 * Named rather than inline functions because the whole point of the document
 * format is that a visual editor can read and write it. A function in a JSON
 * file is not editable; a name is.
 */

export const linear = (t) => t;

/** The one wiselab uses everywhere: `t * t * (3 - 2 * t)`. */
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Ken Perlin's improved curve — zero 2nd derivative at both ends. */
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export const easeIn = (t) => t * t;
export const easeOut = (t) => t * (2 - t);
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export const EASINGS = {
  linear,
  smoothstep,
  smootherstep,
  easeIn,
  easeOut,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
};

/**
 * Unknown easing names throw rather than silently falling back to linear.
 *
 * A typo'd easing that quietly becomes linear is a motion bug you find by
 * squinting at a running page — exactly the class of problem this engine
 * exists to make checkable.
 */
export function resolveEase(name) {
  if (name === undefined || name === null) return linear;
  const fn = EASINGS[name];
  if (!fn) {
    throw new Error(
      `3drossa: unknown easing "${name}". Known: ${Object.keys(EASINGS).join(", ")}`
    );
  }
  return fn;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, k) => a + (b - a) * k;
