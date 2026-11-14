import * as THREE from "three";

const DEG = 180 / Math.PI;

/**
 * A world offset from the orbit's centre, as the orbit row that puts the lens
 * there — the inverse of `Journey.sampleOrbit`.
 *
 * Azimuth 0 is +Z, 90 is +X, elevation is up from the horizontal, distance is
 * straight-line. `nearAzimuth` keeps the answer on the same winding as the row
 * being edited: rows may run past ±180 on purpose (a sweep from 190 to 332 is a
 * sweep), and snapping 300 back to -60 would turn the camera the long way
 * round between that row and its neighbours.
 *
 * Returns null for a zero offset, which has no direction.
 */
export function orbitFromOffset(offset, nearAzimuth = 0) {
  const v = offset instanceof THREE.Vector3 ? offset : new THREE.Vector3().fromArray(offset);
  const distance = v.length();
  if (!(distance > 1e-6)) return null;

  const elevation = Math.asin(THREE.MathUtils.clamp(v.y / distance, -1, 1)) * DEG;
  let azimuth = Math.atan2(v.x, v.z) * DEG;
  azimuth += Math.round((nearAzimuth - azimuth) / 360) * 360;

  return {
    azimuth: Number(azimuth.toFixed(1)),
    elevation: Number(elevation.toFixed(1)),
    distance: Number(distance.toFixed(2)),
  };
}
