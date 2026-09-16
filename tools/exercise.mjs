/**
 * Drives the editor's own controls in a real browser and reports what changed.
 *
 *   node tools/exercise.mjs [url]
 *
 * Exists because the overlay is the one part of the engine that cannot be
 * checked in node, and because the interesting failures here are ORDERING
 * failures — a document that references a station the live journey has not
 * heard of yet, a rename that leaves path rows pointing at the old id. Those
 * only appear when the real buttons are pressed in the real order.
 *
 * Every step is a click or a keystroke on a control a developer would use. None
 * of it reaches into React state, so a step that passes here is a step that
 * works.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const url = process.argv[2] || "http://localhost:3411/";

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
    `--user-data-dir=${path.join(OUT, ".exercise-profile")}`,
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
    pending.get(message.id).resolve(message.result);
    pending.delete(message.id);
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
  const result = await send("Runtime.evaluate", {
    expression: `JSON.stringify((() => { ${expression} })())`,
    returnByValue: true,
  });
  const raw = result.result?.value;
  return raw === undefined ? result.result : JSON.parse(raw);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

/**
 * Helpers injected into the page.
 *
 * `setInput` goes through React's own value setter and then fires the events
 * React listens for. Assigning `input.value` directly does nothing useful on a
 * controlled input: React's cached value tracker sees no change and swallows
 * the event, so the field visibly updates and the document does not — which
 * looks exactly like the handler being broken.
 */
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.rossaButton = (pattern, index = 0) =>
      [...document.querySelectorAll("button")]
        .filter((b) => new RegExp(pattern, "i").test(b.textContent))[index] || null;

    window.rossaSetInput = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      ).set;
      setter.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    /**
     * Commit a field the way leaving it does.
     *
     * React has no "blur" listener to fire at: it delegates, and the event that
     * bubbles is focusout. Dispatching a plain non-bubbling blur reaches
     * nothing, which reads as the commit handler being broken when it was never
     * called. Calling blur() alone does nothing either, unless the element is
     * actually focused first.
     */
    window.rossaCommit = (input) => {
      input.focus();
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      input.blur();
    };

    window.rossaSummary = () => {
      const doc = window.__rossaEditor?.doc;
      if (!doc) return { error: "editor not mounted" };
      return {
        mode: doc.camera.mode,
        cameraRows: doc.cameraPath.length,
        stations: doc.stations.map((s) => s.id),
        derivedFrom: [...new Set(doc.path.filter((r) => r.station).map((r) => r.station))],
        rows: doc.path.length,
      };
    };
  `,
});

await send("Page.navigate", { url });
await sleep(7000);

const step = async (label, expression, settle = 2200) => {
  await send("Runtime.evaluate", { expression });
  await sleep(settle);
  const summary = await evaluate("return window.rossaSummary();");
  console.log(label.padEnd(16), JSON.stringify(summary));
  return summary;
};

// A clean slate: an autosaved draft from a previous run would otherwise be
// restored, and every count below would start from somewhere unexpected.
await send("Runtime.evaluate", {
  expression: `localStorage.removeItem("3drossa:playground")`,
});

await step("open", `window.rossaButton("edit path")?.click()`, 5000);

/**
 * Somewhere with room, before adding anything.
 *
 * Both "+ add" buttons place a row at the CURRENT scroll position and refuse to
 * stack two rows on one progress — so at the top of the page, where a waypoint
 * already sits at p = 0, every add is correctly a no-op. Running the harness
 * there tests nothing and looks like a broken button.
 */
await step("scroll", `window.__rossa.scrollTo(0.47)`, 2000);

await step("camera: path", `window.rossaButton("^path$")?.click()`);
await step("+ camera row", `window.rossaButton("camera point")?.click()`);
await step("+ path row", `window.rossaButton("add here")?.click()`);
await step("looks at sub.", `window.rossaButton("looks at: subject")?.click()`);

// Open the first station card, then rename it through its own input.
await step("open station", `window.rossaButton("^▸$")?.click()`);
await step(
  "rename",
  `(() => {
     const input = [...document.querySelectorAll("input")]
       .find((i) => i.value === "launch");
     if (!input) return "no name field";
     window.rossaSetInput(input, "departure");
     window.rossaCommit(input);
   })()`
);

// The camera route's own remove, not a station's: scoped to the row that
// carries the fov field, so a reordering of the panel cannot silently turn this
// step into "delete a station" — which is exactly what it did once.
await step(
  "- camera row",
  `(() => {
     const row = [...document.querySelectorAll("div")]
       .filter((d) => /degrees/.test(d.textContent) && /^#\\d/.test(d.textContent.trim()))
       .pop();
     row?.querySelector("button")?.click();
   })()`
);

/**
 * Drop a model on the page, the way a visitor would.
 *
 * A synthesised DragEvent with a real DataTransfer, not a call into the
 * component: the handler is on the window and reads `event.dataTransfer.files`,
 * so anything short of a genuine event tests a code path nobody takes.
 */
const glb = await fs.readFile(path.resolve("tools/out/triangle.glb"));
await send("Runtime.evaluate", {
  expression: `(() => {
    const bytes = Uint8Array.from(atob("${glb.toString("base64")}"), (c) => c.charCodeAt(0));
    const file = new File([bytes], "triangle.glb", { type: "model/gltf-binary" });
    const data = new DataTransfer();
    data.items.add(file);
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  })()`,
});
await sleep(3000);

const model = await evaluate(`
  const scene = window.__rossa?.scene;
  if (!scene) return { error: "no scene published" };

  let found = null;
  scene.traverse((o) => {
    if (o.name === "rossa-test-tri") found = o;
  });
  if (!found) return { loaded: false };

  // The fit() wrapper is what makes an arbitrary export read at the same size
  // as the built-in subject, so the scale it ended up with is the thing worth
  // asserting: a model authored in millimetres must not arrive as a speck.
  const scale = found.getWorldScale(new found.position.constructor());
  return { loaded: true, named: found.name, worldScale: Number(scale.x.toFixed(3)) };
`);
console.log("model drop".padEnd(16), JSON.stringify(model));

const stored = await evaluate(`
  const raw = localStorage.getItem("3drossa:playground");
  if (!raw) return { draft: false };
  const doc = JSON.parse(raw);
  return {
    draft: true,
    bytes: raw.length,
    stations: doc.stations.map((s) => s.id),
    cameraRows: doc.cameraPath.length,
    mode: doc.camera.mode,
    rows: doc.path.length,
    derivedFrom: [...new Set(doc.path.filter((r) => r.station).map((r) => r.station))],
  };
`);
console.log("draft".padEnd(16), JSON.stringify(stored));

const shot = await send("Page.captureScreenshot", { format: "png" });
await fs.writeFile(path.join(OUT, "exercise.png"), Buffer.from(shot.data, "base64"));
console.log("->", "tools/out/exercise.png");

console.log(
  errors.length ? `\nERRORS:\n  ${errors.slice(0, 8).join("\n  ")}` : "\nno page errors"
);

ws.close();
proc.kill();
process.exit(errors.length ? 1 : 0);
