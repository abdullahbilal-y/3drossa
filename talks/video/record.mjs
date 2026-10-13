/**
 * Records the live part of the demo video, frame by frame, on a virtual clock.
 *
 *   node record.mjs [tour|editor]      (both when omitted)
 *
 * Headless WebGL is SwiftShader, and a screenshot costs ~300ms, so real-time
 * capture would stutter. Instead requestAnimationFrame, performance.now and
 * Date.now are replaced before the page loads; each video frame advances the
 * clock by exactly 1/30s, runs the queued frame callbacks, and is captured.
 * The scene's damping and the beats see a perfect 30fps no matter how slowly
 * the frame actually renders.
 */

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

// Playwright is not a dependency of the package; use a global install.
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium } = require("playwright");

const URL_ = "http://localhost:3411/";
const FPS = 30;
const DT = 1000 / FPS;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const only = process.argv[2];

// ---------------------------------------------------------------------------
// In-page: virtual clock, caption, cursor.

const INIT = String.raw`(() => {
  const realRAF = window.requestAnimationFrame.bind(window);
  const realCAF = window.cancelAnimationFrame.bind(window);
  const realPerf = performance.now.bind(performance);
  const realDate = Date.now;
  let manual = false, vnow = 0, dateOffset = 0, nextId = 1;
  let queue = new Map();
  const pending = new Map();

  performance.now = () => (manual ? vnow : realPerf());
  Date.now = () => (manual ? Math.round(dateOffset + vnow) : realDate());

  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    if (manual) { queue.set(id, cb); return id; }
    pending.set(id, realRAF((ts) => {
      if (!pending.has(id)) return;
      pending.delete(id);
      if (manual) queue.set(id, cb); else cb(ts);
    }));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    queue.delete(id);
    if (pending.has(id)) { realCAF(pending.get(id)); pending.delete(id); }
  };

  window.__vt = {
    start() { if (manual) return; vnow = realPerf(); dateOffset = realDate() - vnow; manual = true; },
    step(ms) {
      vnow += ms;
      const due = queue; queue = new Map();
      for (const cb of due.values()) { try { cb(vnow); } catch (e) { console.error(e); } }
    },
  };

  const css = ` + "`" + String.raw`
    #__ov { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: Inter, sans-serif; }
    #__ov .cap { position: absolute; bottom: 30px; max-width: 900px; padding: 14px 22px 16px;
      background: rgba(7, 10, 12, 0.86); border-left: 4px solid #f5a623; border-radius: 10px;
      color: #f6f1e9; font-size: 25px; line-height: 1.32; font-weight: 600; letter-spacing: -0.005em;
      box-shadow: 0 10px 40px rgba(0,0,0,0.45); }
    #__ov .cap.center { left: 50%; transform: translateX(-50%); }
    #__ov .cap.left { left: 28px; max-width: 850px; }
    #__ov .kick { display: block; font-size: 12px; letter-spacing: 0.24em; color: #f5a623; font-weight: 600; margin-bottom: 6px; }
    #__ov .cur { position: absolute; left: 0; top: 0; width: 26px; height: 26px; }
    #__ov .ring { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
      border: 3px solid #f5a623; opacity: 0; }
    #__ov .chip { position: absolute; padding: 6px 10px; background: #f6f1e9; color: #11181c; border-radius: 6px;
      font: 600 14px Inter, sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,0.4); }
  ` + "`" + String.raw`;

  window.__ov = {
    root: null,
    ensure() {
      if (this.root) return;
      const style = document.createElement("style");
      style.textContent = css;
      document.documentElement.appendChild(style);
      const root = document.createElement("div");
      root.id = "__ov";
      root.innerHTML =
        '<div class="cap center" style="opacity:0"><span class="kick"></span><span class="txt"></span></div>' +
        '<div class="ring"></div>' +
        '<div class="chip" style="display:none">rocket.glb</div>' +
        '<svg class="cur" viewBox="0 0 26 26" style="display:none"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15 L18.6 15 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      // On <html>, not <body>: the editor lifts every child of <body> and strips its background.
      document.documentElement.appendChild(root);
      this.root = root;
    },
    set(s) {
      this.ensure();
      const cap = this.root.querySelector(".cap");
      cap.className = "cap " + (s.align || "center");
      cap.style.opacity = String(s.capOpacity ?? 0);
      cap.style.marginBottom = ((1 - (s.capOpacity ?? 0)) * -8) + "px";
      cap.querySelector(".kick").textContent = s.kicker || "";
      cap.querySelector(".kick").style.display = s.kicker ? "block" : "none";
      cap.querySelector(".txt").textContent = s.caption || "";
      const cur = this.root.querySelector(".cur");
      cur.style.display = s.cursor ? "block" : "none";
      if (s.cursor) cur.style.transform = "translate(" + (s.cursor[0] - 3) + "px," + (s.cursor[1] - 2) + "px) scale(" + (s.pressed ? 0.88 : 1) + ")";
      const ring = this.root.querySelector(".ring");
      ring.style.opacity = String(s.ring ?? 0);
      if (s.cursor) { ring.style.left = s.cursor[0] + "px"; ring.style.top = s.cursor[1] + "px"; ring.style.transform = "scale(" + (s.ringScale ?? 1) + ")"; }
      const chip = this.root.querySelector(".chip");
      chip.style.display = s.chip && s.cursor ? "block" : "none";
      if (s.chip && s.cursor) { chip.style.left = (s.cursor[0] + 18) + "px"; chip.style.top = (s.cursor[1] + 20) + "px"; }
    },
  };
})();`;

// ---------------------------------------------------------------------------
// Timeline helpers.

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

/** Piecewise linear over [[t, v]], then Gaussian-smoothed, sampled per frame. */
function smoothTrack(keys, duration, sigma = 0.55) {
  const n = Math.round(duration * FPS) + 1;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    let v = keys[keys.length - 1][1];
    for (let k = 0; k < keys.length - 1; k++) {
      const [t0, v0] = keys[k], [t1, v1] = keys[k + 1];
      if (t <= t0) { v = v0; break; }
      if (t <= t1) { v = lerp(v0, v1, (t - t0) / (t1 - t0)); break; }
    }
    raw.push(v);
  }
  const s = Math.round(sigma * FPS), out = [];
  const w = Array.from({ length: 2 * s + 1 }, (_, i) => Math.exp(-((i - s) ** 2) / (2 * (s / 2) ** 2)));
  const ws = w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -s; j <= s; j++) acc += raw[Math.max(0, Math.min(n - 1, i + j))] * w[j + s];
    out.push(acc / ws);
  }
  return out;
}

/** Eased cursor path over [[t, x, y]] — stops at every key, like a hand does. */
function cursorAt(keys, t) {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let k = 0; k < keys.length - 1; k++) {
    const [t0, x0, y0] = keys[k], [t1, x1, y1] = keys[k + 1];
    if (t <= t1) {
      const e = easeInOut(clamp01((t - t0) / (t1 - t0)));
      return [lerp(x0, x1, e), lerp(y0, y1, e)];
    }
  }
  const last = keys[keys.length - 1];
  return [last[1], last[2]];
}

/** Caption state at t, from [[from, to, kicker, text]], with 0.35s fades. */
function captionAt(list, t) {
  for (const [a, b, kicker, caption] of list) {
    if (t >= a && t <= b) {
      const o = Math.min(clamp01((t - a) / 0.35), clamp01((b - t) / 0.35));
      return { kicker, caption, capOpacity: o };
    }
  }
  return { capOpacity: 0 };
}

// ---------------------------------------------------------------------------

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });

// Warm the dev server's on-demand compile of the editor chunk, off camera.
{
  const warm = await context.newPage();
  await warm.goto(URL_, { waitUntil: "networkidle" });
  await warm.waitForTimeout(2500);
  await warm.getByRole("button", { name: /edit path/i }).click();
  await warm.waitForTimeout(5000);
  await warm.close();
}

await context.addInitScript(INIT);
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[page]", m.text().slice(0, 240)); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(URL_, { waitUntil: "networkidle" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important} html{scroll-behavior:auto!important}" });
await page.evaluate(() => localStorage.clear());
await page.waitForTimeout(4000);
await page.evaluate(() => window.__vt.start());

const cdp = await context.newCDPSession(page);
let dir = null, n = 0;
let overlay = { capOpacity: 0 };

async function begin(name) {
  dir = path.join(HERE, "frames", name);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  n = 0;
  console.log(`-- ${name}`);
}

/** Advance one frame; capture it unless `dir` is null (settling off camera). */
async function frame(state = overlay, before) {
  const [sx, sy] = await page.evaluate(({ dt, s, before }) => {
    if (before !== undefined) window.scrollTo({ top: before, behavior: "instant" });
    window.__ov.set(s);
    window.__vt.step(dt);
    return [window.scrollX, window.scrollY];
  }, { dt: DT, s: state, before });
  if (!dir) return;
  // CDP clips in DOCUMENT coordinates, so the viewport is wherever the scroll is.
  const clip = { x: sx, y: sy, width: 1280, height: 720, scale: 1.5 };
  const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, clip });
  await fs.writeFile(path.join(dir, String(n++).padStart(5, "0") + ".jpg"), Buffer.from(data, "base64"));
  if (n % 90 === 0) console.log(`   ${n} frames`);
}

async function settle(frames, state = { capOpacity: 0 }) {
  const keep = dir; dir = null;
  for (let i = 0; i < frames; i++) await frame(state);
  dir = keep;
}

const range = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

// ---------------------------------------------------------------------------
// TOUR — scroll the whole page.

if (!only || only === "tour") {
  await settle(30, { capOpacity: 0 }, 0);
  const D = 25;
  const p = smoothTrack([[0, 0], [2.6, 0], [10.6, 0.4], [13.2, 0.58], [21.2, 0.92], [23.6, 1], [D, 1]], D);
  const caps = [
    [0.3, 3.3, "THE PAGE", "Scroll drives it all: where the subject flies, where the camera looks, when the copy appears."],
    [3.7, 10.6, "STATIONS", "A station pins the page. Copy arrives on beats while the frame holds."],
    [11.0, 13.8, "TRAVEL", "Between stations the pin lets go, and the subject travels."],
    [14.2, 21.0, "PROGRESS", "Each waypoint is bound to measured scroll progress, so it arrives with its copy."],
    [21.4, 25, "NO MAGIC NUMBERS", "No hand-tuned lerp() calls. Every framing is keyframes the editor can drag."],
  ];
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await settle(20);
  await begin("tour");
  for (let i = 0; i < p.length; i++) {
    const t = i / FPS;
    await frame({ ...captionAt(caps, t), align: "center" }, p[i] * range);
  }
}

// ---------------------------------------------------------------------------
// EDITOR — open it, drag, scrub, drop a model, orbit.

if (!only || only === "editor") {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), 0.3 * range);
  await settle(70);
  await begin("editor");

  const box = async (sel, re) =>
    page.evaluate(({ sel, re }) => {
      const el = [...document.querySelectorAll(sel)].find((e) => !re || new RegExp(re, "i").test(e.textContent));
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, left: r.x };
    }, { sel, re });

  let t = 0;
  let cur = [640, 430];
  let pressed = false, ring = 0, ringScale = 1, chip = false;
  const caps = [];
  const say = (a, b, kicker, text) => caps.push([a, b, kicker, text]);
  const state = () => ({ ...captionAt(caps, t), align: "left", cursor: cur, pressed, ring, ringScale, chip });
  const tick = async () => { await frame(state()); t += 1 / FPS; };
  const idle = async (sec, fn) => { const end = t + sec; while (t < end - 1e-6) { if (fn) await fn(); await tick(); } };

  /** Move the visible AND the real cursor along an eased path. */
  const moveTo = async (x, y, sec, { drag = false } = {}) => {
    const from = [...cur], start = t;
    await idle(sec, async () => {
      const e = easeInOut(clamp01((t - start) / sec));
      cur = [lerp(from[0], x, e), lerp(from[1], y, e)];
      if (drag) await page.mouse.move(cur[0], cur[1]);
    });
    cur = [x, y];
    if (drag) await page.mouse.move(x, y);
  };
  const click = async () => {
    await page.mouse.move(cur[0], cur[1]);
    pressed = true; await page.mouse.down(); await tick(); await tick();
    pressed = false; await page.mouse.up();
    const start = t;
    await idle(0.35, async () => { const k = (t - start) / 0.35; ring = 1 - k; ringScale = 0.6 + k * 1.1; });
    ring = 0;
  };

  // 1 — open the editor.
  say(0.2, 3.9, "THE EDITOR", "Edit path mounts the editor over the live page. Not a separate tool.");
  const edit = await box("button", "edit path");
  await idle(0.3);
  await moveTo(edit.x, edit.y, 1.3);
  await click();
  await idle(0.8);
  await moveTo(560, 470, 1.0);

  // 2 — what you are looking at.
  say(4.2, 9.0, "WHAT YOU SEE", "Red: your real copy, measured from the DOM. Yellow: your waypoints. Teal: handed to a station.");
  await idle(9.2 - t);

  // 3 — drag a waypoint out of the copy.
  say(9.3, 15.6, "DRAG", "Drag a waypoint out of the copy. The spline rebuilds every frame.");
  const wp = await page.evaluate(() => window.__rossaEditor.screenOf(3));
  await moveTo(wp.x, wp.y, 1.0);
  await page.mouse.move(wp.x, wp.y);
  pressed = true; await page.mouse.down();
  await idle(0.25);
  {
    const from = [...cur], start = t, sec = 2.6;
    await idle(sec, async () => {
      const e = easeInOut(clamp01((t - start) / sec));
      cur = [from[0] + 170 * e, from[1] - 165 * e + Math.sin(e * Math.PI) * -30];
      await page.mouse.move(cur[0], cur[1]);
    });
  }
  pressed = false; await page.mouse.up();
  await idle(15.8 - t);

  // 4 — the scrub bar scrolls the real page.
  say(16.0, 21.6, "SCRUB", "The scrub bar scrolls the real page. Pins, beats and copy all move with it.");
  const slider = await box("[data-rossa-overlay] input[type=range]");
  const ratio = await page.evaluate(() => {
    const el = document.querySelector("[data-rossa-overlay] input[type=range]");
    return (el.value - el.min) / (el.max - el.min);
  });
  const thumbX = (r) => slider.left + 8 + r * (slider.w - 16);
  await moveTo(thumbX(ratio), slider.y, 1.0);
  await page.mouse.move(cur[0], cur[1]);
  pressed = true; await page.mouse.down();
  await moveTo(thumbX(0.74), slider.y, 3.2, { drag: true });
  pressed = false; await page.mouse.up();
  await idle(21.8 - t);

  // 5 — drop your own model; it is written into the repository.
  say(22.0, 28.4, "YOUR MODEL", "Drop a .glb on the page, and it's written into your repo under public/models.");
  const glb = (await fs.readFile(path.join(HERE, "rocket.glb"))).toString("base64");
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "rocket.glb", { type: "model/gltf-binary" }));
    window.__dropData = dt;
  }, glb);
  cur = [-40, 520]; chip = true;
  await moveTo(470, 380, 1.4);
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragover", { dataTransfer: window.__dropData, bubbles: true, cancelable: true, clientX: 470, clientY: 380 })));
  await idle(0.9);
  await page.evaluate(() => window.dispatchEvent(new DragEvent("drop", { dataTransfer: window.__dropData, bubbles: true, cancelable: true, clientX: 470, clientY: 380 })));
  chip = false;
  await idle(0.6);
  await moveTo(700, 560, 1.2);
  await idle(28.6 - t);

  // 6 — orbit to check depth.
  say(28.8, 35.2, "DEPTH", "Orbit to check depth: does the path pass in front of the copy, or behind it?");
  const cam = await box("[data-rossa-overlay] button", "camera:");
  await moveTo(cam.x, cam.y, 1.1);
  await click();
  await moveTo(330, 600, 1.0);
  await page.mouse.move(cur[0], cur[1]);
  pressed = true; await page.mouse.down();
  await moveTo(80, 560, 2.6, { drag: true });
  pressed = false; await page.mouse.up();
  await idle(35.4 - t);
}

console.log("done");
await browser.close();
