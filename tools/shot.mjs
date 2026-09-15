/**
 * A CDP screenshot + probe harness. No puppeteer, no install.
 *
 *   node tools/shot.mjs <url> <outPrefix> [progress ...]
 *
 * Launches headless Chrome over the DevTools protocol, scrolls the page to each
 * given progress value, waits for the scene to settle, and writes a PNG plus
 * whatever the page reports about its own state.
 *
 * Two things that will otherwise waste your time:
 *
 *   - Headless WebGL runs on SwiftShader at a few frames a second, and every
 *     eased value in the engine damps with a clamped dt. Anything that eases
 *     takes many WALL seconds to converge, so the settle wait is generous on
 *     purpose. Numbers that look wrong are usually just numbers read too early.
 *
 *   - Ask the page where it is, do not assume. window.__rossa is published in
 *     development for exactly this.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const [, , url, prefix = "shot", ...progresses] = process.argv;

if (!url) {
  console.error("usage: node tools/shot.mjs <url> <outPrefix> [progress ...]");
  process.exit(1);
}

const stops = progresses.length ? progresses.map(Number) : [0, 0.25, 0.5, 0.75, 1];
const PORT = 9223 + Math.floor(Math.random() * 400);
const OUT = path.resolve("tools/out");

async function findChrome() {
  for (const candidate of CHROME) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("no Chrome or Edge found");
}

const rpc = (ws) => {
  let id = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  });

  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id;
      pending.set(next, { resolve, reject });
      ws.send(JSON.stringify({ id: next, method, params }));
    });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const chrome = await findChrome();

  const proc = spawn(
    chrome,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--user-data-dir=" + path.join(OUT, ".profile"),
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
  if (!target) throw new Error("chrome did not come up");

  // Node 22 ships a global WebSocket; no dependency needed.
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  const send = rpc(ws);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const errors = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      errors.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text
      );
    }
  });

  await send("Page.navigate", { url });
  await sleep(6000);

  for (const stop of stops) {
    await send("Runtime.evaluate", {
      expression: `window.__rossa ? (window.__rossa ? window.__rossa.scrollTo(${stop}) : rossaScroll(${stop})) : rossaScroll(${stop})`,
      awaitPromise: false,
    });

    // Generous: SwiftShader plus damped easing means convergence is measured
    // in wall seconds, not frames.
    await sleep(4000);

    const probe = await send("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const s = window.__rossa;
        if (!s) return { error: "window.__rossa missing" };
        const q = s.state.sample;
        return {
          progress: +s.state.progress.toFixed(4),
          station: s.state.station,
          stationT: +s.state.stationT.toFixed(3),
          held: +s.state.held.toFixed(3),
          travel: q.travel.toArray().map(n => +n.toFixed(3)),
          scale: +q.beats.scale.toFixed(3),
          fov: +q.camera.fov.toFixed(2),
        };
      })())`,
      returnByValue: true,
    });

    console.log(`p=${stop}`, probe.result.value);

    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = path.join(OUT, `${prefix}-${String(stop).replace(".", "_")}.png`);
    await fs.writeFile(file, Buffer.from(shot.data, "base64"));
    console.log("  ->", path.relative(process.cwd(), file));
  }

  if (errors.length) {
    console.log("\nPAGE ERRORS:");
    for (const error of errors.slice(0, 10)) console.log(" ", error.split("\n")[0]);
  } else {
    console.log("\nno page errors");
  }

  ws.close();
  proc.kill();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
