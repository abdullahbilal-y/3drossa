/**
 * Opens the editor overlay in the demo and screenshots it.
 *
 *   node tools/editor.mjs [url] [progress]
 *
 * Exists because the overlay is the one part of the engine that cannot be
 * checked in node: it depends on the live DOM, on R3F pointer plumbing, and on
 * the canvas actually being on top of the page.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const url = process.argv[2] || "http://localhost:3411/";
const stop = Number(process.argv[3] ?? 0.24);

const PORT = 9500 + Math.floor(Math.random() * 300);
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
    `--user-data-dir=${path.join(OUT, ".editor-profile")}`,
    "--window-size=1600,1000",
    "about:blank",
  ],
  { stdio: "ignore" }
);

let target;
for (let i = 0; i < 60; i++) {
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
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.rossaScroll = (t) => {
    const range = document.documentElement.scrollHeight - window.innerHeight;
    const top = t * range;
    const smooth = window.__lenis || window.lenis;
    if (smooth && smooth.scrollTo) return smooth.scrollTo(top, { immediate: true, force: true });
    window.scrollTo({ top, behavior: "auto" });
  };`,
});

await send("Page.navigate", { url });
await sleep(7000);

await send("Runtime.evaluate", {
  expression: `(window.__rossa ? window.__rossa.scrollTo(${stop}) : rossaScroll(${stop}))`,
});
await sleep(2500);

// Open the editor by pressing the host's own toggle, so the path under test is
// the one a developer actually takes.
await send("Runtime.evaluate", {
  expression: `(() => {
    const button = [...document.querySelectorAll("button")]
      .find((b) => /edit path/i.test(b.textContent));
    if (!button) return "toggle not found";
    button.click();
    return "clicked";
  })()`,
  returnByValue: true,
}).then((r) => console.log("toggle:", r.result.value));

await sleep(6000);

const probe = await send("Runtime.evaluate", {
  expression: `JSON.stringify((() => {
    const panel = [...document.querySelectorAll("div")]
      .find((d) => /Save to journey.json/.test(d.textContent) && d.style.position === "fixed");
    const canvas = document.querySelector("canvas");
    return {
      panelPresent: !!panel,
      canvasZIndex: canvas?.parentElement?.style.zIndex,
      canvasPointerEvents: canvas?.parentElement?.style.pointerEvents,
      frames: window.__rossa.state.frames,
      progress: +window.__rossa.state.progress.toFixed(3),
      station: window.__rossa.state.station,
    };
  })())`,
  returnByValue: true,
});
console.log(probe.result.value);

const shot = await send("Page.captureScreenshot", { format: "png" });
const file = path.join(OUT, "editor.png");
await fs.writeFile(file, Buffer.from(shot.data, "base64"));
console.log("->", path.relative(process.cwd(), file));

console.log(errors.length ? `\nERRORS:\n  ${errors.slice(0, 8).join("\n  ")}` : "\nno page errors");

ws.close();
proc.kill();
