import { assertSortedTrack, channelsOf } from "./track.js";

/**
 * The journey document: parse, validate, serialize.
 *
 * One artifact describes a whole experience, and it is plain data all the way
 * down — no functions — so a visual editor can read it, drag it and write it
 * back. Everything wiselab expresses as `(t, out) => { out.x = lerp(...) }` is
 * a keyframe pair here.
 */

export const DOCUMENT_VERSION = 1;

const DEFAULTS = {
  version: DOCUMENT_VERSION,
  lens: { z: 5.9, fov: 38, aspect: 1.6 },
  /**
   * What fraction of the frame the copy occupies. Beyond this is margin.
   *
   * This is a fallback. The editor overlay measures the host page's real text
   * blocks instead, which is strictly better — this constant is a guess at the
   * layout, and the layout is right there to be measured.
   */
  column: 0.79,
  /**
   * Centripetal Catmull-Rom: no cusps or self-intersections at sharp
   * left-to-right crossings, which a uniform spline produces and which read as
   * the subject flicking sideways.
   */
  curve: { curveType: "centripetal", tension: 0.4, closed: false },
  /**
   * How the lens behaves. All of it, as data.
   *
   * These used to be hardcoded coefficients inside the renderer, which made
   * "the whole journey is one document" untrue in the one place people most
   * want to change: whether the camera moves at all.
   *
   *   "follow"  the lens holds its viewpoint and LEANS toward the subject
   *   "beats"   it follows only the beats track, with no lean
   *   "locked"  it never moves — it sits at `position` and looks at `target`
   *   "path"    it flies its own spline, `cameraPath`, bound to progress
   *   "orbit"   it circles `target` at an authored angle and distance
   *
   * "locked" with `stations: false` and no parallax is a completely static
   * camera: the world moves, the lens does not.
   */
  camera: {
    mode: "follow",
    /** Do station camera framings take over while a station is held? */
    stations: true,
    /** Where a locked lens sits. */
    position: [0, 0, 6],
    target: [0, 0, 0],
    /**
     * The field of view a LOCKED lens holds.
     *
     * Null means "the document's lens fov". This exists because locked used to
     * mean locked in position only: fov still tracked the global beats track,
     * so a camera the author had explicitly nailed down went on breathing in
     * and out a couple of degrees at a time. That reads as a slow zoom nobody
     * asked for, and — because the beats track is usually written for a
     * following camera — it is never the zoom you wanted either.
     */
    fov: null,
    /**
     * What a PATH camera looks at: its own target spline, or the subject.
     *
     * Aiming at the subject is the common case for a flythrough — you want to
     * choose the route without also hand-authoring where the lens points at
     * every moment of it.
     */
    pathTarget: "path",
    /**
     * What an ORBIT camera circles: `target`, or the subject.
     *
     * Orbiting is the product shot — the one everyone wants and the one that is
     * miserable to author as raw xyz, because holding a constant distance while
     * swinging around an object means writing a circle out by hand, and every
     * keyframe you get slightly wrong shows up as the model lurching toward or
     * away from the lens.
     */
    orbitTarget: "target",
    /** How far the lens leans toward the subject, per world unit. */
    follow: { x: 0.22, y: 0.18, targetX: 0.42, targetY: 0.32 },
    /**
     * Pointer parallax, in world units at full deflection. Off by default:
     * it is the first thing to make a still shot feel unsteady, and it should
     * be an explicit choice.
     */
    parallax: { x: 0, y: 0 },
    /** Convergence rates. Higher is snappier. */
    damping: { position: 4.5, station: 3.2, parallax: 2.5, fov: 4 },
  },
  /**
   * How the subject carries itself. All of it, as data.
   *
   * `rotation` is the one that has to exist. useSubject aims local +Z at the
   * direction of travel, and an imported model is as likely to be built facing
   * -Z or +X — so without a correction the very first thing anyone sees after
   * dropping in their own model is it flying sideways or tail-first, with no
   * way to fix it short of wrapping it in a rotated group in their own code.
   * Degrees, applied after the heading, in the subject's own frame.
   */
  subject: {
    /**
     * Whether the subject travels, or simply stands there.
     *
     * "fixed" is the product-page case and it is not a degenerate path: a car
     * does not fly across the page, it sits still while the CAMERA moves around
     * it. Expressing that as a one-waypoint path would be a lie — the spline,
     * the progress binding and the station handoffs would all still be running,
     * and every one of them is a way for a thing that should not move to move.
     */
    mode: "path",
    /**
     * The model the page flies, as a URL the site serves.
     *
     * In the document rather than in the host's JSX, so that dropping a model
     * on the page is a complete action: the file is written into the repository
     * and the document records where it went. The next person to clone the repo
     * gets both halves, and nobody has to remember to edit a component.
     */
    model: null,
    /** Where a fixed subject stands. World units. */
    position: [0, 0, 0],
    /**
     * A base size for the subject, multiplied by the beats track.
     *
     * Downloaded models arrive at wildly different scales — metres,
     * centimetres, whatever the author's units were — so "how big is it" has to
     * be adjustable without touching the beats track, which is about how big it
     * READS at each moment, not about what units the file happened to use.
     */
    scale: 1,
    heading: true,
    rotation: [0, 0, 0],
    /** How hard it chases the path, and how fast it turns. */
    damping: 9,
    headingDamping: 3,
    /** Idle motion, so a parked reader still sees something alive. */
    bob: 1,
  },
  stations: [],
  path: [],
  /**
   * The camera's own route, when `camera.mode` is "path".
   *
   * Same shape as the subject's path — rows bound to measured progress — but
   * in WORLD space, because a camera position is a place in the world and not
   * a fraction of a frame it is itself defining.
   */
  cameraPath: [],
  /**
   * The camera's orbit, when `camera.mode` is "orbit".
   *
   * Angles in degrees, distance in world units, bound to progress like every
   * other table here. Azimuth 0 is straight in front (+Z), climbing
   * anticlockwise; elevation 0 is level with the target.
   */
  orbit: [],
  beats: [],
};

export const CAMERA_MODES = ["follow", "beats", "locked", "path", "orbit"];
export const SUBJECT_MODES = ["path", "fixed"];

export function normalizeDocument(input) {
  if (!input || typeof input !== "object") {
    throw new Error("3drossa: journey document must be an object");
  }

  const doc = {
    ...DEFAULTS,
    ...input,
    lens: { ...DEFAULTS.lens, ...(input.lens || {}) },
    curve: { ...DEFAULTS.curve, ...(input.curve || {}) },
    subject: {
      ...DEFAULTS.subject,
      ...(input.subject || {}),
      rotation: [...(input.subject?.rotation || DEFAULTS.subject.rotation)],
      position: [...(input.subject?.position || DEFAULTS.subject.position)],
    },
    camera: {
      ...DEFAULTS.camera,
      ...(input.camera || {}),
      follow: { ...DEFAULTS.camera.follow, ...(input.camera?.follow || {}) },
      parallax: { ...DEFAULTS.camera.parallax, ...(input.camera?.parallax || {}) },
      damping: { ...DEFAULTS.camera.damping, ...(input.camera?.damping || {}) },
    },
    stations: (input.stations || []).map(normalizeStation),
    path: (input.path || []).map((row, i) => normalizePathRow(row, i)),
    cameraPath: (input.cameraPath || []).map((row, i) => normalizeCameraRow(row, i)),
    orbit: (input.orbit || []).map((row, i) => normalizeOrbitRow(row, i)),
    beats: [...(input.beats || [])],
  };

  if (doc.version !== DOCUMENT_VERSION) {
    throw new Error(
      `3drossa: document version ${doc.version} is not supported (expected ${DOCUMENT_VERSION})`
    );
  }

  validate(doc);
  return doc;
}

function normalizeStation(station, i) {
  if (!station.id) throw new Error(`3drossa: station ${i} has no id`);
  return {
    scroll: 2,
    /**
     * Room before and after the pin, in viewport heights.
     *
     * This is how a station MOVES. Where it sits in the scroll is otherwise a
     * consequence of how tall everything above it happens to be, which the
     * document has no business rewriting — that is the host's markup. What the
     * document can own is the space around it, and that turns out to be the
     * same thing from the reader's side: the gap between two stations IS the
     * travel section, and its length is a choreography decision, not a layout
     * one.
     *
     * Negative pulls a station earlier, eating slack above it. Useful, and
     * capable of overlapping the preceding section if you take too much.
     */
    lead: 0,
    trail: 0,
    ...station,
    camera: [...(station.camera || [])],
    subject: [...(station.subject || [])],
  };
}

function normalizePathRow(row, i) {
  if (typeof row.p !== "number" || !Number.isFinite(row.p)) {
    throw new Error(`3drossa: path row ${i} has no numeric p`);
  }
  return { ...row };
}

/**
 * A camera waypoint. `target` is optional and defaults to the origin, so the
 * quickest possible flythrough is a list of positions.
 */
function normalizeCameraRow(row, i) {
  if (typeof row.p !== "number" || !Number.isFinite(row.p)) {
    throw new Error(`3drossa: camera path row ${i} has no numeric p`);
  }
  return { target: [0, 0, 0], ...row, position: [...(row.position || [0, 0, 6])] };
}

/** One orbit keyframe. Everything optional but `p` — the defaults are a shot. */
function normalizeOrbitRow(row, i) {
  if (typeof row.p !== "number" || !Number.isFinite(row.p)) {
    throw new Error(`3drossa: orbit row ${i} has no numeric p`);
  }
  return { azimuth: 0, elevation: 10, distance: 6, ...row };
}

function validate(doc) {
  if (!CAMERA_MODES.includes(doc.camera.mode)) {
    throw new Error(
      `3drossa: unknown camera mode "${doc.camera.mode}". ` +
        `Known: ${CAMERA_MODES.join(", ")}`
    );
  }

  const ids = new Set();
  for (const s of doc.stations) {
    if (ids.has(s.id)) throw new Error(`3drossa: duplicate station id "${s.id}"`);
    ids.add(s.id);
    assertSortedTrack(s.camera, `station "${s.id}" camera`);
    assertSortedTrack(s.subject, `station "${s.id}" subject`);
    if (!(s.scroll > 0)) {
      throw new Error(`3drossa: station "${s.id}" needs a positive scroll length`);
    }
    for (const field of ["lead", "trail"]) {
      if (!Number.isFinite(s[field])) {
        throw new Error(`3drossa: station "${s.id}" needs a numeric ${field}`);
      }
    }
  }

  assertSortedTrack(doc.beats, "beats", "at");

  if (doc.path.length < 2) {
    throw new Error("3drossa: path needs at least two waypoints");
  }

  /**
   * Progress must climb.
   *
   * progressToU walks the table assuming it is sorted; an out-of-order p
   * silently sends the subject backwards along the spline, which looks like a
   * glitch rather than like bad data.
   */
  for (let i = 1; i < doc.path.length; i++) {
    if (!(doc.path[i].p > doc.path[i - 1].p)) {
      throw new Error(
        `3drossa: path row ${i} has p=${doc.path[i].p}, which does not come ` +
          `after ${doc.path[i - 1].p}`
      );
    }
  }

  assertSortedTrack(doc.cameraPath, "camera path", "p");

  for (const [i, row] of doc.cameraPath.entries()) {
    for (const field of ["position", "target"]) {
      const v = row[field];
      if (!Array.isArray(v) || v.length !== 3 || v.some((n) => !Number.isFinite(n))) {
        throw new Error(`3drossa: camera path row ${i} needs a 3-number ${field}`);
      }
    }
  }

  /**
   * "path" with nothing to fly is a document that says one thing and does
   * another: the renderer would silently fall back and the author would be
   * left wondering why the mode had no effect. Refusing it is how the editor
   * knows to seed a route when you pick the mode.
   */
  if (!SUBJECT_MODES.includes(doc.subject.mode)) {
    throw new Error(
      `3drossa: unknown subject mode "${doc.subject.mode}". Known: ${SUBJECT_MODES.join(", ")}`
    );
  }

  assertSortedTrack(doc.orbit, "orbit", "p");

  /**
   * An orbit needs somewhere to be. One row is a perfectly good shot — a fixed
   * camera at an authored angle — so one is the floor, not two.
   */
  if (doc.camera.mode === "orbit" && doc.orbit.length < 1) {
    throw new Error('3drossa: camera mode "orbit" needs at least one orbit waypoint');
  }

  for (const [i, row] of doc.orbit.entries()) {
    for (const field of ["azimuth", "elevation", "distance"]) {
      if (!Number.isFinite(row[field])) {
        throw new Error(`3drossa: orbit row ${i} needs a numeric ${field}`);
      }
    }
    if (!(row.distance > 0)) {
      throw new Error(`3drossa: orbit row ${i} needs a distance greater than zero`);
    }
  }

  const rotation = doc.subject.rotation;
  if (!Array.isArray(rotation) || rotation.length !== 3 || rotation.some((n) => !Number.isFinite(n))) {
    throw new Error("3drossa: subject.rotation must be three numbers, in degrees");
  }

  if (doc.camera.mode === "path" && doc.cameraPath.length < 2) {
    throw new Error(
      '3drossa: camera mode "path" needs at least two cameraPath waypoints'
    );
  }

  for (const [i, row] of doc.path.entries()) {
    if (row.station !== undefined) {
      if (!ids.has(row.station)) {
        throw new Error(`3drossa: path row ${i} derives from unknown station "${row.station}"`);
      }
      if (typeof row.at !== "number") {
        throw new Error(`3drossa: path row ${i} derives from "${row.station}" but has no at`);
      }
    } else {
      for (const key of ["sx", "y", "z"]) {
        if (typeof row[key] !== "number" || !Number.isFinite(row[key])) {
          throw new Error(`3drossa: path row ${i} is missing a numeric ${key}`);
        }
      }
    }
  }
}

/**
 * Serialize back to JSON text.
 *
 * Stable key order and fixed precision, so that parse -> serialize -> parse is
 * byte-identical and a save that changes nothing produces no diff. A tool that
 * dirties a file just by opening it is a tool people stop using.
 */
export function serializeDocument(doc, { precision = 4 } = {}) {
  const n = (v) => (typeof v === "number" ? Number(v.toFixed(precision)) : v);
  const nums = (v) => (Array.isArray(v) ? v.map(n) : n(v));

  const key = (k) => {
    const out = {};
    for (const field of ["t", "at"]) if (k[field] !== undefined) out[field] = n(k[field]);
    for (const ch of channelsOf(k)) out[ch] = nums(k[ch]);
    for (const field of Object.keys(k)) {
      if (field.endsWith("Ease") || field === "ease") out[field] = k[field];
    }
    return out;
  };

  return `${JSON.stringify(
    {
      version: doc.version,
      lens: doc.lens,
      column: doc.column,
      curve: doc.curve,
      camera: doc.camera,
      subject: doc.subject,
      stations: doc.stations.map((s) => ({
        id: s.id,
        scroll: s.scroll,
        lead: n(s.lead),
        trail: n(s.trail),
        camera: s.camera.map(key),
        subject: s.subject.map(key),
      })),
      path: doc.path.map((row) =>
        row.station !== undefined
          ? { p: n(row.p), station: row.station, at: n(row.at) }
          : { p: n(row.p), sx: n(row.sx), y: n(row.y), z: n(row.z) }
      ),
      orbit: doc.orbit.map((row) => {
        const out = {
          p: n(row.p),
          azimuth: n(row.azimuth),
          elevation: n(row.elevation),
          distance: n(row.distance),
        };
        if (row.fov !== undefined) out.fov = n(row.fov);
        if (row.ease !== undefined) out.ease = row.ease;
        return out;
      }),
      cameraPath: doc.cameraPath.map((row) => {
        const out = { p: n(row.p), position: nums(row.position), target: nums(row.target) };
        if (row.fov !== undefined) out.fov = n(row.fov);
        if (row.ease !== undefined) out.ease = row.ease;
        return out;
      }),
      beats: doc.beats.map(key),
    },
    null,
    2
  )}\n`;
}
