import * as THREE from "three";
import { createLens } from "./screen.js";
import { normalizeDocument, serializeDocument } from "./document.js";
import { sampleTrack } from "./track.js";
import { clamp01 } from "./ease.js";

/**
 * The runtime. Pure, stateless, and free of React, DOM and WebGL.
 *
 * Statelessness is a deliberate constraint, not an accident of layering. It is
 * what makes an experience CHECKABLE: given a document, the whole journey can
 * be swept in node and asserted against — continuity, keep-out margins, station
 * handoffs — with no browser, no GPU and no screenshots. Every motion bug this
 * engine was extracted from was found by instrumenting a running page, because
 * there was no other way to look at it.
 *
 * Damping and blending are NOT here. `sample()` reports where the travel path
 * is and where the station wants the subject; easing between the two across
 * time is runtime state, and belongs to the renderer (src/react/Stage.jsx).
 */

const _scratch = { sx: 0, y: 0, z: 0, scale: 1 };

const DEFAULT_LOOK_AHEAD = 0.004;

export class Journey {
  constructor(document) {
    this.doc = normalizeDocument(document);
    this.lens = createLens(this.doc.lens);

    this.stations = new Map(this.doc.stations.map((s) => [s.id, s]));

    /**
     * Station-derived waypoints are resolved by ASKING the station, never by
     * copying its numbers into the path.
     *
     * A station overrides the subject while it is held, so the path's only job
     * at a station boundary is to hand off. When the two are maintained
     * separately they drift — and they drift every time a station is retuned.
     * The drift shows up as the subject teleporting at the boundary. Deriving
     * makes that impossible rather than merely unlikely.
     */
    this.path = this.doc.path.map((row) => this.resolveRow(row));

    this.curve = this.buildCurve(this.path);

    /** The progress range each station occupies, read off the path table. */
    this.ranges = this.buildRanges();
  }

  /** Where a station puts the subject at its own time t, in screen space. */
  stationSubject(id, t, out = { sx: 0, y: 0, z: 0, scale: 1 }) {
    const station = this.stations.get(id);
    if (!station) throw new Error(`3drossa: no station "${id}"`);
    return sampleTrack(station.subject, clamp01(t), out);
  }

  /** A station's written camera framing at its own time t. */
  stationCamera(id, t, out = {}) {
    const station = this.stations.get(id);
    if (!station) throw new Error(`3drossa: no station "${id}"`);
    return sampleTrack(station.camera, clamp01(t), out);
  }

  resolveRow(row) {
    if (row.station === undefined) return { ...row };
    this.stationSubject(row.station, row.at, _scratch);
    return { ...row, sx: _scratch.sx, y: _scratch.y, z: _scratch.z };
  }

  buildCurve(path) {
    const { curveType, tension, closed } = this.doc.curve;
    const points = path.map(
      (pt) => new THREE.Vector3(this.lens.toWorldX(pt.sx, pt.z), pt.y, pt.z)
    );
    return new THREE.CatmullRomCurve3(points, closed, curveType, tension);
  }

  buildRanges() {
    const ranges = new Map();
    for (const row of this.doc.path) {
      if (row.station === undefined) continue;
      const range = ranges.get(row.station) || { from: Infinity, to: -Infinity };
      range.from = Math.min(range.from, row.p);
      range.to = Math.max(range.to, row.p);
      ranges.set(row.station, range);
    }
    return ranges;
  }

  /**
   * Page progress -> curve parameter.
   *
   * Because every waypoint declares the progress it belongs to, the subject is
   * guaranteed to be AT that waypoint when the reader is at that point in the
   * page. It moves faster between distant waypoints, which is correct: it is
   * covering more ground in the same amount of scroll.
   *
   * Spacing waypoints evenly and hoping they line up with the sections does
   * not work — sections are wildly different heights, so an evenly-spaced
   * spline drifts, and a beat written for one section plays over another.
   */
  progressToU(p) {
    const path = this.path;
    const last = path.length - 1;
    if (p <= path[0].p) return 0;
    if (p >= path[last].p) return 1;

    let i = 0;
    while (i < last - 1 && p > path[i + 1].p) i++;

    const a = path[i];
    const b = path[i + 1];
    return (i + (p - a.p) / (b.p - a.p)) / last;
  }

  /**
   * Which station a page progress falls inside, and how far through it.
   *
   * Derived from the path table so the engine can be swept headlessly. At
   * runtime the React layer passes the MEASURED pin state instead, which is
   * authoritative: the document says where a station is meant to be, the pin
   * knows where the layout actually put it.
   */
  stationAt(p) {
    for (const [id, range] of this.ranges) {
      if (p >= range.from && p <= range.to) {
        const span = range.to - range.from;
        return { id, t: span <= 0 ? 0 : (p - range.from) / span };
      }
    }
    return null;
  }

  /** Global beats: how big the subject reads, and where the lens sits. */
  beats(p, out = {}) {
    return sampleTrack(this.doc.beats, clamp01(p), out, "at");
  }

  /**
   * Everything the renderer needs for one frame.
   *
   * `held` is a TARGET (0 or 1), not a blend. The renderer damps toward it, so
   * arriving at a station is a move that settles rather than a cut.
   *
   * Pass `context` to override station detection with the measured pin state:
   * `{ station: "cocoon", stationT: 0.42 }`, or `{ station: null }` to say
   * nothing is pinned.
   */
  sample(p, out = makeSample(), context = null) {
    const progress = clamp01(p);
    out.progress = progress;

    const u = this.progressToU(progress);
    out.u = u;
    this.curve.getPoint(u, out.travel);

    const lookAhead = this.doc.lookAhead ?? DEFAULT_LOOK_AHEAD;
    this.curve.getPoint(Math.min(u + lookAhead, 1), out.heading);

    this.beats(progress, out.beats);

    const held =
      context && context.station !== undefined
        ? context.station
          ? { id: context.station, t: context.stationT ?? 0 }
          : null
        : this.stationAt(progress);

    if (held) {
      out.station = held.id;
      out.stationT = clamp01(held.t);
      out.held = 1;

      this.stationSubject(held.id, out.stationT, out.subject);
      out.subjectWorld.set(
        this.lens.toWorldX(out.subject.sx, out.subject.z),
        out.subject.y,
        out.subject.z
      );

      const cam = this.stationCamera(held.id, out.stationT, out.cameraRaw);
      if (cam.position) out.camera.position.fromArray(cam.position);
      if (cam.target) out.camera.target.fromArray(cam.target);
      out.camera.fov = cam.fov !== undefined ? cam.fov : out.beats.fov;
    } else {
      out.station = null;
      out.stationT = 0;
      out.held = 0;
      out.camera.fov = out.beats.fov;
    }

    return out;
  }

  /** Half the visible width at a depth — the editor draws the keep-out wedge. */
  halfWidthAt(z) {
    return this.lens.halfWidthAt(z);
  }

  toWorldX(sx, z) {
    return this.lens.toWorldX(sx, z);
  }

  toScreenX(x, z) {
    return this.lens.toScreenX(x, z);
  }

  toJSON() {
    return this.doc;
  }

  serialize(options) {
    return serializeDocument(this.doc, options);
  }
}

/** Reusable frame output — allocate once, pass it back in every frame. */
export function makeSample() {
  return {
    progress: 0,
    u: 0,
    travel: new THREE.Vector3(),
    heading: new THREE.Vector3(),
    subject: { sx: 0, y: 0, z: 0, scale: 1 },
    subjectWorld: new THREE.Vector3(),
    camera: { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38 },
    cameraRaw: {},
    beats: { scale: 1, camY: 0, camZ: 6, fov: 38 },
    station: null,
    stationT: 0,
    held: 0,
  };
}
