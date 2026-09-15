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
     * Where the subject ACTUALLY is, if the host tells us.
     *
     * The path is not the subject. A host is free to add idle motion, damping,
     * a retreat on dense sections, a station override — all of which move the
     * thing on screen away from the curve. An editor marker that shows the
     * curve instead then disagrees with the object the whole page is about, and
     * the honest reading of that is "the subject is not following the path".
     *
     * Hosts call stage.publishSubject() each frame; the editor prefers it over
     * the curve whenever it is available.
     */
    subject: null,
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
  let lastProgress = 0;
  let lastTime = 0;
  let running = false;
  /** Pixels of scroll per unit of progress. Measured, not computed — see tick. */
  let scrollSpan = 0;

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

    /**
     * The HOST owns progress when it has its own.
     *
     * Deriving it here from scrollY looks equivalent and is not. A page driven
     * by GSAP ScrollTrigger with a scrub, over a trigger element that is not the
     * whole document, produces a materially different number — measured at 0.786
     * where the raw scroll said 0.45. Everything then samples a different point
     * on the same path, and the subject appears to ignore a curve it is in fact
     * following exactly.
     *
     * Two sources of truth for progress is the same mistake as two copies of the
     * waypoint table, one level down.
     */
    state.progress = options.progress
      ? clamp01(options.progress())
      : range > 0
        ? clamp01(y / range)
        : 0;

    const dt = lastTime ? (now - lastTime) / 1000 : 0;
    state.velocity = dt > 0 ? (y - lastY) / dt : 0;

    /**
     * Learn how many pixels of scroll make one unit of progress.
     *
     * Do not compute it. On this page the document is 17444px tall and the
     * progress range turned out to be 9100 — GSAP measured its trigger before
     * the pinned sections expanded the document, so every formula derived from
     * scrollHeight is wrong by nearly a factor of two, and the scrub bar ran
     * out of road at about 55%.
     *
     * Watching the page instead works whatever the host is doing: scroll and
     * progress are both observable, and their ratio is the answer. Smoothed,
     * because a single frame's delta is noisy.
     */
    const movedY = y - lastY;
    const movedP = state.progress - lastProgress;
    if (Math.abs(movedP) > 1e-4 && Math.abs(movedY) > 0.5) {
      const measured = movedY / movedP;
      if (measured > 0) scrollSpan = scrollSpan * 0.8 + measured * 0.2;
    }

    lastY = y;
    lastProgress = state.progress;
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

    /**
     * Tell the stage where the subject really is, each frame.
     *
     * Takes anything with x/y/z, so a host can hand over a Vector3 it already
     * maintains without copying.
     */
    publishSubject(position) {
      if (!position) return;
      if (!state.subject) state.subject = { x: 0, y: 0, z: 0 };
      state.subject.x = position.x;
      state.subject.y = position.y;
      state.subject.z = position.z;
    },
    /**
     * Scroll the page so the journey sits at a given progress.
     *
     * A smooth-scroll library has to be ASKED, not bypassed. Lenis and its kind
     * set the scroll position every frame from their own internal target, so a
     * bare window.scrollTo is overwritten before the next paint and the page
     * simply does not move — which makes the scrub bar look broken on exactly
     * the sites most likely to be using this.
     *
     * Pass `scrollTo` to createStage to be explicit. Otherwise the usual dev
     * handles are tried, then the window.
     */
    scrollTo(progress) {
      const root = getRoot();
      if (!root) return;

      const target = clamp01(progress);

      const apply = (top) => {
        const clamped = Math.max(0, Math.min(top, root.scrollHeight - window.innerHeight));
        if (typeof options.scrollTo === "function") {
          options.scrollTo(clamped, target);
          return;
        }
        const smooth = window.__lenis || window.lenis;
        if (smooth && typeof smooth.scrollTo === "function") {
          smooth.scrollTo(clamped, { immediate: true, force: true });
          return;
        }
        window.scrollTo({ top: clamped, behavior: "auto" });
      };

      /**
       * Aim, look, correct.
       *
       * One shot at progress x span cannot be right: the host decides what
       * progress means, and the mapping is not always the one the document
       * height implies — GSAP can measure its trigger before pinned sections
       * expand the page, which on this site made every computed guess nearly
       * twice too far. So steer: move, read where that actually landed, and
       * close the gap. It converges in a handful of frames and needs to know
       * nothing about the host.
       */
      const span = scrollSpan || root.scrollHeight - window.innerHeight;
      apply(window.scrollY + (target - state.progress) * span);


      /**
       * One shot. No correction loop.
       *
       * A closed loop was tried — move, read, correct — and it is worse than
       * the open one. When the host's progress lags its scroll (GSAP's scrub
       * eases over about a second), every reading during the ramp is stale, the
       * learned span is inflated by a large scroll delta against a small
       * progress delta, and the corrections compound: asking for 0.3 landed on
       * 1.0. A single proportional move lands close and, more importantly,
       * lands in the same place every time.
       *
       * `scrollSpan` sharpens this for free once the reader has scrolled at
       * all, because then it has been measured rather than assumed.
       */
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
