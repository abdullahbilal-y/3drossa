/**
 * Does the camera sit still when the page and the pointer do?
 *
 *   node tools/shake.mjs [url] [progress]
 *
 * Parks the scroll inside a station, holds the pointer at a fixed off-centre
 * position, and samples the camera for a couple of seconds. With nothing
 * moving, every sample should be identical. Peak-to-peak movement is the shake.
 *
 * Off-centre matters: parallax scales with pointer distance from the middle, so
 * a pointer parked at dead centre hides the bug completely.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const url = process.argv[2] || "http://localhost:3411/";
const stop = Number(process.argv[3] ?? 0.24);

const PORT = 9600 + Math.floor(Math.random() * 190);
const OUT = path.resolve("tools/out");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await fs.mkdir(OUT, { recursive: true });

const proc = spawn(
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${path.join(OUT, ".shake-profile")}`,
    "--window-size=1600,1000",
    "about:blank",
  ],
  { stdio: "ignore" }
);

let target;
for (let i = 0; i < 80; i++) {
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {}
  await sleep(250);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve } = pending.get(message.id);
    pending.delete(message.id);
    resolve(message.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const next = ++id;
    pending.set(next, { resolve });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
// Smooth-scroll libraries overwrite window.scrollTo every frame, so the page
// must be moved through them. Defined in the page for every harness.
await send("Runtime.addScriptToEvaluateOnNewDocument", {
  source: `window.rossaScroll = (t) => {
    const range = document.documentElement.scrollHeight - window.innerHeight;
    const top = t * range;
    const smooth = window.__lenis || window.lenis;
    if (smooth && smooth.scrollTo) return smooth.scrollTo(top, { immediate: true, force: true });
    window.scrollTo({ top, behavior: "auto" });
  };`,
});

await send("Page.navigate", { url });
await sleep(9000);

await evaluate(`(() => {
  if (window.__rossa) return (window.__rossa ? window.__rossa.scrollTo(${stop}) : rossaScroll(${stop}));
  const range = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: ${stop} * range, behavior: "auto" });
})()`);
await sleep(4000);

// Park the pointer well off centre and leave it there.
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1300, y: 300, button: "none" });
await sleep(6000);

const camera = await evaluate(`typeof window.__rossa?.camera`);
if (camera !== "object") {
  console.error(`no camera on window.__rossa (got ${camera}) — is <Stage> mounted?`);
  ws.close();
  proc.kill();
  process.exit(1);
}

/**
 * Parallax GAIN — the deterministic half of the bug.
 *
 * Headless cannot reproduce the visible jitter: its frame timing is slow but
 * very consistent, so the feedback loop settles to a stable fixed point. What
 * it CAN measure is how far the camera moves per unit of pointer movement. If
 * that exceeds the configured parallax, the offset is being fed back into
 * itself — and then any variation in frame time moves the camera, which is
 * precisely what a reader sees as shake.
 */
const parallax = Number(process.env.ROSSA_PARALLAX || 0.2);

const cameraXAt = async (screenX) => {
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: screenX,
    y: 500,
    button: "none",
  });
  await sleep(5000);
  const value = await evaluate(
    `JSON.stringify(window.__rossa.camera.position.toArray())`
  );
  return JSON.parse(value)[0];
};

const centre = await cameraXAt(800);
const right = await cameraXAt(1300);

const ndc = (1300 / 1600) * 2 - 1;
const expected = Math.abs(ndc * parallax);
const measured = Math.abs(right - centre);

console.log(
  `parallax gain: expected ${expected.toFixed(4)}, measured ${measured.toFixed(4)}`
);
console.log(`  amplification: ${(measured / expected).toFixed(1)}x`);
console.log(
  measured > expected * 1.5
    ? "  FAIL — the parallax offset is being fed back into itself\n"
    : "  OK — parallax is applied once\n"
);

console.log("scroll and pointer are now still; sampling the camera…\n");

const samples = [];
for (let i = 0; i < 40; i++) {
  const value = await evaluate(
    `JSON.stringify(window.__rossa.camera.position.toArray())`
  );
  samples.push(JSON.parse(value));
  await sleep(50);
}

const axis = (n) => samples.map((s) => s[n]);
const spread = (values) => Math.max(...values) - Math.min(...values);

const dx = spread(axis(0));
const dy = spread(axis(1));
const dz = spread(axis(2));

console.log("camera x:", axis(0).slice(0, 6).map((v) => v.toFixed(4)).join("  "), "…");
console.log("camera y:", axis(1).slice(0, 6).map((v) => v.toFixed(4)).join("  "), "…");
console.log(
  `\npeak-to-peak over ${samples.length} samples:  ` +
    `x ${dx.toFixed(4)}   y ${dy.toFixed(4)}   z ${dz.toFixed(4)}`
);

const worst = Math.max(dx, dy, dz);
console.log(
  worst < 0.002
    ? "\nPASS — the camera is still."
    : `\nFAIL — the camera moves ${worst.toFixed(4)} world units with nothing moving.`
);

ws.close();
proc.kill();
process.exit(worst < 0.002 ? 0 : 1);
