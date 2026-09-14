import { Journey, makeSample } from "../core/index.js";

/**
 * A stage: the live state of one journey on one page.
 *
 * This is a plain object, not React state and not a module singleton.
 *
 *   NOT React state — scrolling writes to it sixty times a second. Held in
 *   useState it would reconcile the tree on every frame. GSAP writes, useFrame
 *   reads, React never hears about it, and the scroll pipeline costs zero
 *   renders.
 *
 *   NOT a module singleton — that breaks two stages on one page, and leaks
 *   between requests under SSR.
 *
 * It is passed explicitly to both <Stage> (inside the Canvas) and <Station>
 * (in the DOM) because R3F's Canvas is a separate reconciler root: React
 * context does NOT cross it. Threading one object through is less machinery
 * than bridging context, and much easier to debug when a beat misfires.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (t) => t * t * (3 - 2 * t);

export function createStage(document, options = {}) {
  const journey = new Journey(document);

  const state = {
    /** 0 -> 1 across the whole scroll range. */
    progress: 0,
    /** px/s. Drives anything that should react to how fast the reader moves. */
    velocity: 0,
    /** The pinned station currently held, or null while travelling. */
    station: null,
    /** Progress through the held station, 0..1. Meaningless when null. */
    stationT: 0,
    /** Latest frame, sampled from the journey. Reused, never reallocated. */
    sample: makeSample(),
    /** Damped 0..1 blend toward the held station. Owned by <Stage>. */
    held: 0,
    /** True while the reader has asked for reduced motion. */
    reducedMotion: false,
    /**
     * Frames sampled. Lets a harness tell "the loop is not running" apart from
     * "the loop is running and the numbers are wrong" - two failures that look
     * identical from outside and have nothing in common.
     */
    frames: 0,
  };

  const stations = new Map();
  let frame = null;
  let lastY = 0;
  let lastTime = 0;
  let running = false;

  /** The element whose height defines the scroll range. */
  const getRoot = () =>
    (typeof options.root === "function" ? options.root() : options.root) ||
    (typeof window !== "undefined" ? window.document.documentElement : null);

  function registerStation(id, entry) {
    stations.set(id, entry);
    return () => stations.delete(id);
  }

  /**
   * One loop for the whole page.
   *
   * Every station could own a scroll listener, and the obvious version does.
   * But then N listeners each read scrollY and each force their own layout
   * flush. One loop reads the scroll position once per frame and hands it to
   * everyone, which is both faster and — more importantly — makes the ordering
   * deterministic: progress is always updated before any station reads it.
   */
  function tick(now) {
    frame = requestAnimationFrame(tick);

    const root = getRoot();
    if (!root) return;

    const y = window.scrollY || window.pageYOffset || 0;
    const range = root.scrollHeight - window.innerHeight;

    state.progress = range > 0 ? clamp01(y / range) : 0;

    const dt = lastTime ? (now - lastTime) / 1000 : 0;
    state.velocity = dt > 0 ? (y - lastY) / dt : 0;
    lastY = y;
    lastTime = now;

    // Stations resolve after progress, and publish whichever one holds the
    // viewport. A station knows where the layout actually put it; the document
    // only knows where it was meant to be.
    let held = null;
    for (const [id, entry] of stations) {
      const t = entry.measure(y);
      if (t !== null) held = { id, t };
      entry.stage(t);
    }

    state.station = held ? held.id : null;
    state.stationT = held ? held.t : 0;
  }

  function start() {
    if (running || typeof window === "undefined") return;
    running = true;

    state.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    frame = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTime = 0;
  }

  const stage = {
    journey,
    state,
    /**
     * Swap in an edited document without remounting the scene.
     *
     * The editor needs the subject on screen to fly the path being dragged;
     * otherwise it is a diagram sitting next to the thing it claims to
     * control. Everything downstream reads stage.journey fresh each frame, so
     * replacing it is enough - and an invalid intermediate document throws
     * here, leaving the previous one in place rather than tearing the page
     * down.
     */
    rebuild(next) {
      stage.journey = new Journey(next);
      return stage.journey;
    },
    registerStation,
    start,
    stop,
    /** Scroll the page so the journey sits at a given progress. */
    scrollTo(progress) {
      const root = getRoot();
      if (!root) return;
      const range = root.scrollHeight - window.innerHeight;
      window.scrollTo({ top: clamp01(progress) * range, behavior: "auto" });
    },
  };

  return stage;
}

/**
 * Beat staging.
 *
 * Content is marked [data-beat="0.4"] — "arrive 40% through this station" —
 * and optionally [data-beat-out="0.7"] to leave again. They are BEATS, not
 * durations: a station can be made longer or shorter and every element keeps
 * its relative place in the sequence.
 *
 * data-beat-out is what makes a pinned viewport carry a whole section. It lets
 * one statement hand the frame to the next, so three things can occupy the
 * same space in sequence instead of needing three screens to stack them.
 *
 * Driven directly from the station clock rather than by its own tween, so
 * scrubbing backwards reverses it exactly.
 */
export function stageBeats(elements, t) {
  for (const el of elements) {
    if (t === null) continue;

    const at = Number(el.dataset.beat) || 0;
    const span = Number(el.dataset.beatSpan) || 0.12;
    const out = el.dataset.beatOut ? Number(el.dataset.beatOut) : null;

    const k = clamp01((t - at) / span);
    const enter = smoothstep(k);

    let exit = 1;
    if (out !== null) {
      exit = 1 - smoothstep(clamp01((t - out) / span));
    }

    el.style.opacity = String(enter * exit);
    el.style.transform = `translate3d(0, ${
      26 * (1 - enter) - 22 * (1 - exit)
    }px, 0)`;
  }
}
