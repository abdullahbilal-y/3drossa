/**
 * Can you actually click a waypoint?
 *
 *   node tools/click.mjs [url] [progress] [waypointIndex]
 *
 * Asks the page to project the waypoint to screen coordinates, clicks there,
 * and checks the editor selected it.
 *
 * An earlier version hunted for the handle's colour in a screenshot. Two things
 * made that worse than useless: R3F tone-maps by default, so the rendered pixel
 * is nowhere near the hex in the source; and a PNG decoder that assumes 4 bytes
 * per pixel reads pure zeroes out of Chrome's 3-byte RGB screenshots without
 * complaining. It reported a broken editor while the editor was fine, then a
 * fine editor while it could not see anything at all. Ask the page instead.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const url = process.argv[2] || "http://localhost:3411/";
const stop = Number(process.argv[3] ?? 0.45);
const index = Number(process.argv[4] ?? 0);

const PORT = 9800 + Math.floor(Math.random() * 190);
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
    `--user-data-dir=${path.join(OUT, ".click-profile")}`,
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
    const details = message.params.exceptionDetails;
    errors.push((details.exception?.description || details.text).split("\n")[0]);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const next = ++id;
    pending.set(next, { resolve });
    ws.send(JSON.stringify({ id: next, method, params }));
  });

const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  return result.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url });
await sleep(7000);

// The host may not mount <Stage>, in which case no stage handle exists until
// the editor is open. Fall back to scrolling the document directly.
await evaluate(`(() => {
  if (window.__rossa) return window.__rossa.scrollTo(${stop});
  const range = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: ${stop} * range, behavior: "auto" });
})()`);
await sleep(2000);
await evaluate(
  `[...document.querySelectorAll("button")].find(b=>/edit path/i.test(b.textContent)).click()`
);
await sleep(5000);

const shoot = async (name) => {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(path.join(OUT, name), Buffer.from(shot.data, "base64"));
};

// Did the camera actually fit the path, or is it still wherever the page left it?
const cameraState = await evaluate(`JSON.stringify((() => {
  const e = window.__rossaEditor;
  if (!e) return { error: "__rossaEditor missing" };
  return {
    position: e.camera.position.toArray().map((n) => +n.toFixed(2)),
    target: e.controls ? e.controls.target.toArray().map((n) => +n.toFixed(2)) : null,
    hasControls: !!e.controls,
  };
})())`);
console.log("camera:", cameraState);

const spot = await evaluate(`JSON.stringify(window.__rossaEditor.screenOf(${index}))`);
console.log(`waypoint #${index} on screen:`, spot);

const point = JSON.parse(spot || "null");
if (!point || point.behind) {
  console.error("FAIL: waypoint is not in front of the camera");
  ws.close();
  proc.kill();
  process.exit(1);
}

const x = Math.round(point.x);
const y = Math.round(point.y);

const onCanvas = await evaluate(`document.elementFromPoint(${x}, ${y})?.tagName`);
console.log("element at that point:", onCanvas);

await shoot("click-before.png");

for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
  await send("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button: "left",
    buttons: type === "mousePressed" ? 1 : 0,
    clickCount: type === "mouseMoved" ? 0 : 1,
  });
  await sleep(150);
}
await sleep(2500);

await shoot("click-after.png");

const selection = await evaluate(`JSON.stringify(window.__rossaEditor.selection)`);
console.log("selection after click:", selection);

const ok = onCanvas === "CANVAS" && selection && selection !== "null";

console.log(
  errors.length ? `\nERRORS:\n  ${errors.slice(0, 5).join("\n  ")}` : "\nno page errors"
);
console.log(ok ? "PASS — the handle is clickable." : "FAIL — the click did not select.");

ws.close();
proc.kill();
process.exit(ok ? 0 : 1);
