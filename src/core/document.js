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
  stations: [],
  path: [],
  beats: [],
};

export const CAMERA_MODES = ["follow", "beats", "locked"];

export function normalizeDocument(input) {
  if (!input || typeof input !== "object") {
    throw new Error("3drossa: journey document must be an object");
  }

  const doc = {
    ...DEFAULTS,
    ...input,
    lens: { ...DEFAULTS.lens, ...(input.lens || {}) },
    curve: { ...DEFAULTS.curve, ...(input.curve || {}) },
    camera: {
      ...DEFAULTS.camera,
      ...(input.camera || {}),
      follow: { ...DEFAULTS.camera.follow, ...(input.camera?.follow || {}) },
      parallax: { ...DEFAULTS.camera.parallax, ...(input.camera?.parallax || {}) },
      damping: { ...DEFAULTS.camera.damping, ...(input.camera?.damping || {}) },
    },
    stations: (input.stations || []).map(normalizeStation),
    path: (input.path || []).map((row, i) => normalizePathRow(row, i)),
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
      stations: doc.stations.map((s) => ({
        id: s.id,
        scroll: s.scroll,
        camera: s.camera.map(key),
        subject: s.subject.map(key),
      })),
      path: doc.path.map((row) =>
        row.station !== undefined
          ? { p: n(row.p), station: row.station, at: n(row.at) }
          : { p: n(row.p), sx: n(row.sx), y: n(row.y), z: n(row.z) }
      ),
      beats: doc.beats.map(key),
    },
    null,
    2
  )}\n`;
}
