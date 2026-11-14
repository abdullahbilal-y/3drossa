import * as THREE from "three";

/**
 * The surfaces still painted at load from noise: Saturn and its rings,
 * Venus's cloud deck, and the Moon. Earth, Venus and Jupiter use real maps (see Scenery.jsx).
 * Noise is sampled on the SPHERE (3D), not on the flat map, so there is no
 * seam where the texture's left and right edges meet.
 */

function hash(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

function noise3(x, y, z) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = smooth(x - xi),
    yf = smooth(y - yi),
    zf = smooth(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

function fbm(x, y, z, octaves = 5) {
  let sum = 0,
    amp = 0.5,
    freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * Paint an equirectangular map. `shade(lat, lon, p)` gets latitude in -1..1
 * and a point on the unit sphere, and returns [r, g, b, a?].
 */
function paint(width, height, shade) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    const lat = (0.5 - y / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const lon = (x / width) * Math.PI * 2;
      const p = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
      const [r, g, b, a = 255] = shade(lat / (Math.PI / 2), lon, p);
      const i = (y * width + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = a;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function moonTexture() {
  const dark = hex("#4a4a4c"),
    light = hex("#b9b7b2");
  return paint(512, 256, (_lat, _lon, [x, y, z]) => {
    const n = fbm(x * 3 + 21, y * 3, z * 3);
    // Maria: a few broad dark plains on otherwise pale ground.
    const maria = fbm(x * 1.2 + 5, y * 1.2, z * 1.2, 3) > 0.56 ? 0.55 : 1;
    return mix(dark, light, Math.min(1, n * 1.15) * maria);
  });
}

/** Banded gas giant. `palette` is listed pole-to-equator, mirrored south. */
function bands(palette, turbulence, spot) {
  const colors = palette.map(hex);
  return paint(1024, 512, (lat, lon, [x, y, z]) => {
    const wobble = (fbm(x * 4, y * 9, z * 4, 4) - 0.5) * turbulence;
    const v = Math.abs(lat + wobble) * (colors.length - 1);
    const i = Math.min(colors.length - 2, Math.floor(v));
    let c = mix(colors[colors.length - 1 - i], colors[colors.length - 2 - i], v - i);

    if (spot) {
      const dx = (lon - spot.lon) / spot.w;
      const dy = (lat - spot.lat) / spot.h;
      const d = dx * dx + dy * dy;
      if (d < 1) c = mix(c, hex(spot.color), (1 - d) * 0.85);
    }
    return c;
  });
}

/**
 * Venus as it looks from space: an unbroken deck of pale cloud. NASA's Venus
 * map is a radar image of the SURFACE under those clouds — orange, cratered,
 * and nothing anyone has ever seen with their eyes — so it read as Mars.
 */
export function venusTexture() {
  return bands(["#d9c79c", "#e8dbb8", "#efe4c6", "#e3d2a9", "#f1e8cf"], 0.12);
}

export function saturnTexture() {
  return bands(["#9c8a63", "#cdb98a", "#e3d3a6", "#d6c08f", "#ead9b0", "#d9c491", "#eadbb6"], 0.03);
}

/** Saturn's rings, painted as concentric bands on a square. */
export function ringTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  const inner = 0.45; // as a fraction of the half-size: must match RingGeometry

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5,
        dy = y / size - 0.5;
      const r = Math.hypot(dx, dy) * 2; // 0 at the centre, 1 at the outer edge
      const i = (y * size + x) * 4;
      if (r < inner || r > 1) continue;
      const t = (r - inner) / (1 - inner);
      const gap = t > 0.62 && t < 0.67 ? 0.08 : 1; // the Cassini division
      const grain = 0.65 + 0.35 * noise3(t * 160, 0, 0);
      const fade = Math.min(1, t * 6) * Math.min(1, (1 - t) * 10);
      const tone = 190 + 50 * noise3(t * 40, 3, 0);
      image.data[i] = tone;
      image.data[i + 1] = tone * 0.92;
      image.data[i + 2] = tone * 0.78;
      image.data[i + 3] = 230 * grain * gap * fade;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A soft radial glow, for the sun. */
export function glowTexture(inner = "rgba(255,236,200,1)", outer = "rgba(255,170,80,0)") {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.18, "rgba(255,214,150,0.55)");
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
