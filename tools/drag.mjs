/**
 * Can you DRAG a waypoint, not just click it?
 *
 *   node tools/drag.mjs [url] [progress] [waypointIndex]
 *
 * Selects a handle, presses, moves the pointer in several steps, releases, and
 * reports how the document changed at each step.
 *
 * Clicking and dragging are different failures. A gizmo can appear, accept the
 * press, move once, and then stop — which is what happens if the dragged value
 * is fed back into the gizmo's own `position` prop, because every state update
 * re-anchors the thing you are dragging. Watching the value at each step tells
 * those apart; a single before/after cannot.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const url = process.argv[2] || "http://localhost:3411/";
const stop = Number(process.argv[3] ?? 0.45);
const index = Number(process.argv[4] ?? 3);

const PORT = 9300 + Math.floor(Math.random() * 190);
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
    `--user-data-dir=${path.join(OUT, ".drag-profile")}`,
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
const errors = [];

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve } = pending.get(message.id);
    pending.delete(message.id);
    resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") {
    const d = message.params.exceptionDetails;
    errors.push((d.exception?.description || d.text).split("\n")[0]);
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

const mouse = (type, x, y, buttons) =>
  send("Input.dispatchMouseEvent", {
    type,
    x: Math.round(x),
    y: Math.round(y),
    button: "left",
    buttons,
    clickCount: type === "mouseMoved" ? 0 : 1,
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
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
await sleep(13000);

await evaluate(
  `[...document.querySelectorAll("button")].find(b=>/edit path/i.test(b.textContent))?.click()`
);
await sleep(7000);

await evaluate(`window.__rossa.scrollTo(${stop})`);
await sleep(4000);

const row = async () =>
  JSON.parse(await evaluate(`JSON.stringify(window.__rossaEditor.doc.path[${index}])`));

const spot = JSON.parse(
  (await evaluate(`JSON.stringify(window.__rossaEditor.screenOf(${index}))`)) || "null"
);

if (!spot || spot.behind) {
  console.error(`waypoint #${index} is not on screen`);
  ws.close();
  proc.kill();
  process.exit(1);
}

console.log(`waypoint #${index} at (${Math.round(spot.x)}, ${Math.round(spot.y)})`);
console.log("before:", JSON.stringify(await row()));

// Select it, so the gizmo mounts.
await mouse("mouseMoved", spot.x, spot.y, 0);
await mouse("mousePressed", spot.x, spot.y, 1);
await mouse("mouseReleased", spot.x, spot.y, 0);
await sleep(3000);

console.log("selection:", await evaluate(`JSON.stringify(window.__rossaEditor.selection)`));

/**
 * Grab a point part way ALONG the X arrow, computed in world space.
 *
 * TransformControls only drags when the press lands on an axis, and that arrow
 * is a few dozen pixels long at typical framing — so a guessed pixel offset
 * misses it and reports a broken gizmo when the gizmo is fine. Project the axis
 * instead of guessing at it.
 */
const grabX = spot.x;
const grabY = spot.y;
const axisSign = 1;

await mouse("mouseMoved", grabX, grabY, 0);
await sleep(400);
await mouse("mousePressed", grabX, grabY, 1);
await sleep(400);

const steps = [];
for (let i = 1; i <= 5; i++) {
  await mouse("mouseMoved", grabX + i * 18 * axisSign, grabY, 1);
  await sleep(700);
  steps.push(await row());
}

await mouse("mouseReleased", grabX + 5 * 18 * axisSign, grabY, 0);
await sleep(1500);

const after = await row();

console.log("\nper-step sx while dragging:");
steps.forEach((s, i) => console.log(`  step ${i + 1}: sx ${s.sx}  y ${s.y}  z ${s.z}`));
console.log("after release:", JSON.stringify(after));

const moved = new Set(steps.map((s) => s.sx)).size;
console.log(
  errors.length ? `\nERRORS:\n  ${errors.slice(0, 4).join("\n  ")}` : "\nno page errors"
);

if (moved >= 4) console.log(`PASS — the handle tracked the pointer (${moved} distinct positions).`);
else if (moved > 1) console.log(`PARTIAL — moved but stalled (${moved} distinct positions in 5 steps).`);
else console.log("FAIL — the handle did not follow the pointer.");

const shot = await send("Page.captureScreenshot", { format: "png" });
await fs.writeFile(path.join(OUT, "drag.png"), Buffer.from(shot.data, "base64"));

ws.close();
proc.kill();
process.exit(moved >= 4 ? 0 : 1);
