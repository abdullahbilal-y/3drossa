import { clamp01, lerp, resolveEase } from "./ease.js";

/**
 * Keyframe tracks — the format's one interpolation primitive.
 *
 * Both a station's camera framing and its subject framing are tracks, and so
 * are the global beats. That unification is what makes the whole document
 * editable by one tool: the editor drags keyframes, and does not care whether
 * the keyframe it is dragging is a camera position or a waypoint.
 *
 * The channels are discovered from the keyframes themselves rather than
 * declared, so a document can carry channels this engine has never heard of
 * (a fog density, a light colour) and they interpolate correctly and round-trip
 * through the editor untouched.
 *
 * A channel is a number, or an array of numbers (a vector, of any length).
 */

const RESERVED = new Set(["t", "at", "ease", "id", "p", "station"]);

const isVec = (v) => Array.isArray(v) && v.every((n) => typeof n === "number");
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Channel names on a keyframe: everything that isn't timing or easing. */
export function channelsOf(key) {
  return Object.keys(key).filter(
    (k) => !RESERVED.has(k) && !k.endsWith("Ease") && (isNum(key[k]) || isVec(key[k]))
  );
}

/**
 * Per-channel easing.
 *
 * `ease` sets the segment's default; `<channel>Ease` overrides one channel.
 * This is not gold-plating — wiselab's cocoon station eases its camera and its
 * position on smoothstep but its SCALE on raw t, and without per-channel
 * easing the conversion of a real site is not lossless.
 */
function easeFor(key, channel) {
  const override = key[`${channel}Ease`];
  return resolveEase(override !== undefined ? override : key.ease);
}

/**
 * Sample a track at time `t`, writing into `out`.
 *
 * `out` is reused across frames — nothing here allocates, because this runs
 * inside a render loop.
 */
export function sampleTrack(keys, t, out = {}, timeKey = "t") {
  const last = keys.length - 1;
  if (last < 0) return out;

  if (last === 0) {
    for (const ch of channelsOf(keys[0])) assign(out, ch, keys[0][ch]);
    return out;
  }

  // Walk to the segment containing t. Tracks are short (2-10 keys), so a
  // linear scan beats any index — and it has no state to invalidate.
  let i = 0;
  while (i < last - 1 && t > keys[i + 1][timeKey]) i++;

  const a = keys[i];
  const b = keys[i + 1];
  const span = b[timeKey] - a[timeKey];
  const k = span <= 0 ? 0 : clamp01((t - a[timeKey]) / span);

  for (const ch of channelsOf(a)) {
    const from = a[ch];
    const to = b[ch] !== undefined ? b[ch] : from;
    const eased = easeFor(a, ch)(k);

    if (isVec(from)) {
      const dst = ensureArray(out, ch, from.length);
      for (let n = 0; n < from.length; n++) {
        dst[n] = lerp(from[n], Array.isArray(to) ? to[n] : from[n], eased);
      }
    } else {
      out[ch] = lerp(from, typeof to === "number" ? to : from, eased);
    }
  }

  return out;
}

function assign(out, ch, value) {
  if (isVec(value)) {
    const dst = ensureArray(out, ch, value.length);
    for (let n = 0; n < value.length; n++) dst[n] = value[n];
  } else {
    out[ch] = value;
  }
}

/** Reuse the destination array if it is already the right shape. */
function ensureArray(out, ch, length) {
  let dst = out[ch];
  if (!Array.isArray(dst) || dst.length !== length) {
    dst = new Array(length);
    out[ch] = dst;
  }
  return dst;
}

/** Keys must climb in time, or a scrub runs a segment backwards. */
export function assertSortedTrack(keys, label, timeKey = "t") {
  for (let i = 1; i < keys.length; i++) {
    if (!(keys[i][timeKey] > keys[i - 1][timeKey])) {
      throw new Error(
        `3drossa: ${label} keyframe ${i} has ${timeKey}=${keys[i][timeKey]}, ` +
          `which does not come after ${keys[i - 1][timeKey]}`
      );
    }
  }
}
