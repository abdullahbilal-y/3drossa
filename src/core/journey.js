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
const _camScratch = {};
const _orbitScratch = { azimuth: 0, elevation: 0, distance: 6, fov: undefined };

const DEFAULT_LOOK_AHEAD = 0.004;

/**
 * A progress-bound table -> a curve parameter.
 *
 * Shared by the subject's path and the camera's, because they are the same
 * idea: every row declares the page progress it belongs to, so whatever is
 * being driven is AT that row when the reader is at that point in the page.
 * Between rows it moves faster or slower, which is correct — it is covering
 * more or less ground in the same amount of scroll.
 *
 * Spacing rows evenly and hoping they line up with the sections does not work:
 * sections are wildly different heights, so an evenly-spaced spline drifts, and
 * a moment written for one section plays over another.
 */
function tableToU(table, p) {
  const last = table.length - 1;
  if (last <= 0) return 0;
  if (p <= table[0].p) return 0;
  if (p >= table[last].p) return 1;

  let i = 0;
  while (i < last - 1 && p > table[i + 1].p) i++;

  const a = table[i];
  const b = table[i + 1];
  return (i + (p - a.p) / (b.p - a.p)) / last;
}

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

    /**
     * The camera's own route, when there is one.
     *
     * Two splines, not one: where the lens IS and what it is looking AT move
     * independently, and that independence is the whole expressive point of a
     * camera path. A single curve plus a tangent gives you a rollercoaster —
     * the lens can only ever face the way it is travelling, so it can never
     * hold on something while it moves past it, which is the shot people
     * actually want a camera path for.
     */
    const rows = this.doc.cameraPath;
    if (rows.length >= 2) {
      const { curveType, tension } = this.doc.curve;
      this.cameraCurve = new THREE.CatmullRomCurve3(
        rows.map((r) => new THREE.Vector3().fromArray(r.position)),
        false,
        curveType,
        tension
      );
      this.cameraTargetCurve = new THREE.CatmullRomCurve3(
        rows.map((r) => new THREE.Vector3().fromArray(r.target)),
        false,
        curveType,
        tension
      );
    } else {
      this.cameraCurve = null;
      this.cameraTargetCurve = null;
    }

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
    return tableToU(this.path, p);
  }

  /**
   * Where the lens is at page progress `p`, when the document gives it a route.
   *
   * Returns null when it does not, so a caller can tell "no camera path" from
   * "a camera path that happens to sit at the origin".
   */
  sampleCameraPath(p, out = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: undefined }) {
    if (!this.cameraCurve) return null;

    const u = tableToU(this.doc.cameraPath, clamp01(p));
    this.cameraCurve.getPoint(u, out.position);
    this.cameraTargetCurve.getPoint(u, out.target);

    /**
     * fov comes from the keyframe track rather than the spline, because it is
     * a scalar with no shape to smooth — and routing it through sampleTrack is
     * what gives a camera row the same per-segment `ease` every other keyframe
     * in the document has.
     */
    _camScratch.fov = undefined;
    sampleTrack(this.doc.cameraPath, clamp01(p), _camScratch, "p");
    out.fov = _camScratch.fov;

    return out;
  }

  /**
   * Where an orbiting lens sits at page progress `p`.
   *
   * Spherical, not xyz, because that is how the shot is actually described:
   * "three quarters on, slightly above, two metres out". Authoring the same
   * move as raw coordinates means writing a circle by hand, and every keyframe
   * that is slightly off the radius shows up as the model lurching toward or
   * away from the lens — the single most common defect in a hand-built product
   * shot.
   *
   * Returns null when the document has no orbit, so a caller can tell "no
   * orbit" from "an orbit that happens to sit at the origin".
   */
  sampleOrbit(p, out = { offset: new THREE.Vector3(), fov: undefined }) {
    const rows = this.doc.orbit;
    if (rows.length === 0) return null;

    sampleTrack(rows, clamp01(p), _orbitScratch, "p");

    const azimuth = THREE.MathUtils.degToRad(_orbitScratch.azimuth);
    const elevation = THREE.MathUtils.degToRad(_orbitScratch.elevation);
    const distance = _orbitScratch.distance;

    // Azimuth 0 is straight in front of the target, on +Z, climbing
    // anticlockwise — the same convention as reading a turntable.
    const flat = Math.cos(elevation) * distance;
    out.offset.set(
      Math.sin(azimuth) * flat,
      Math.sin(elevation) * distance,
      Math.cos(azimuth) * flat
    );
    out.fov = _orbitScratch.fov;

    return out;
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

    const subject = this.doc.subject;

    if (subject.mode === "fixed") {
      /**
       * A fixed subject does not sample the spline at all.
       *
       * Not "samples it and ignores the result" — the heading is taken from the
       * same point as the position, so there is no direction of travel to turn
       * toward, and `subject.rotation` is the whole orientation. A car on a
       * product page must be exactly as still as the author said it was.
       */
      out.u = 0;
      out.travel.fromArray(subject.position);
      out.heading.copy(out.travel);
    } else {
      const u = this.progressToU(progress);
      out.u = u;
      this.curve.getPoint(u, out.travel);

      const lookAhead = this.doc.lookAhead ?? DEFAULT_LOOK_AHEAD;
      this.curve.getPoint(Math.min(u + lookAhead, 1), out.heading);
    }

    this.beats(progress, out.beats);

    // Computed whenever the document has a route, not only when the mode is
    // "path": the editor draws it while you are in another mode, which is how
    // you author one before switching to it.
    out.hasCameraPath = this.sampleCameraPath(progress, out.cameraPath) !== null;
    out.hasOrbit = this.sampleOrbit(progress, out.orbit) !== null;

    let held =
      context && context.station !== undefined
        ? context.station
          ? { id: context.station, t: context.stationT ?? 0 }
          : null
        : this.stationAt(progress);

    /**
     * A measured pin for a station this document does not have is ignored.
     *
     * The measured pin state comes from the host's DOM, and the document can be
     * edited underneath it — rename a station in the editor and, for as long as
     * the host's markup still says the old id, every frame would otherwise ask
     * for a station that is not there and throw. Sixty exceptions a second, from
     * inside the render loop, is not a better error message than travelling.
     */
    if (held && !this.stations.has(held.id)) held = null;

    /**
     * A station cannot move a fixed subject.
     *
     * Stations still pin the page and still frame the camera — that is the
     * point of a station on a product page — but a subject the author pinned in
     * place must not be dragged to a station's framing behind their back.
     */
    if (held && subject.mode === "fixed") {
      out.station = held.id;
      out.stationT = clamp01(held.t);
      out.held = 1;
      out.subjectWorld.copy(out.travel);

      /**
       * Report the fixed position as the subject framing too.
       *
       * Anything reading `out.subject` while a station holds would otherwise
       * get the zeroes it was allocated with, and place the subject at the
       * world origin. Leaving a field stale because "nothing should read it
       * here" is how that bug happens; filling it in truthfully is cheap.
       */
      out.subject.sx = this.lens.toScreenX(out.travel.x, out.travel.z);
      out.subject.y = out.travel.y;
      out.subject.z = out.travel.z;
      out.subject.scale = out.beats.scale;

      const cam = this.stationCamera(held.id, out.stationT, out.cameraRaw);
      if (cam.position) out.camera.position.fromArray(cam.position);
      if (cam.target) out.camera.target.fromArray(cam.target);
      out.camera.fov = cam.fov !== undefined ? cam.fov : out.beats.fov;
      return out;
    }

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
    /** Where the camera's own route puts it, when the document has one. */
    cameraPath: {
      position: new THREE.Vector3(),
      target: new THREE.Vector3(),
      fov: undefined,
    },
    hasCameraPath: false,
    /** Where an orbiting lens sits, RELATIVE to whatever it is circling. */
    orbit: { offset: new THREE.Vector3(), fov: undefined },
    hasOrbit: false,
    beats: { scale: 1, camY: 0, camZ: 6, fov: 38 },
    station: null,
    stationT: 0,
    held: 0,
  };
}
