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

/**
 * The demo's document, as it is on disk before any of this runs.
 *
 * The editor can WRITE this file — that is the whole point of the save route —
 * so a harness that presses its buttons can silently rewrite the fixture every
 * other run does. It happened: a selector matched a button it was not aiming at,
 * the demo's journey.json was saved mid-edit, and the next run started from a
 * document nobody had authored, which reads as the editor restoring state it
 * should not have. Nothing here should ever touch it.
 */
const FIXTURE = path.resolve("examples/flight/app/journey.json");
const fixtureBefore = await fs.readFile(FIXTURE, "utf8").catch(() => null);

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
    /** Open a collapsed panel section by name. */
    window.rossaSection = (title) => {
      const header = document.querySelector('[data-rossa-section="' + title + '"]');
      if (!header) return "no section " + title;
      // Only if it is shut — clicking an open one closes it, and the step
      // after would then look like the failure.
      if (header.textContent.trim().startsWith("▾")) return "already open";
      header.click();
      return "opened";
    };

    window.rossaButton = (pattern, index = 0) =>
      [...document.querySelectorAll("button")]
        .filter((b) => new RegExp(pattern, "i").test(b.textContent))[index] || null;

    /**
     * Match a button by its exact label, not by pattern.
     *
     * Several labels here begin with "+", and a "+" reaching new RegExp() is
     * not a plus — it is a quantifier with nothing to repeat, so the
     * constructor throws and the whole step becomes a silent no-op that looks
     * exactly like a button that does not work. Two of them were dead for a
     * while for precisely that reason.
     */
    window.rossaLabel = (text) =>
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text) || null;

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

/**
 * Open once on a draft written by an OLDER version of the format.
 *
 * Storage outlives the code that wrote it, and a stale draft is restored on
 * every refresh — so a draft the editor cannot open is not a bad first render,
 * it is a page the person in front of it cannot get back from. This exact thing
 * shipped: a 0.1.x draft had no `subject` block, the loader handed back the raw
 * JSON instead of the normalized document, and the panel died on
 * `doc.subject.heading`.
 *
 * The minimum a 0.1.x editor could have saved: no subject, no camera path.
 */
await send("Runtime.evaluate", {
  expression: `localStorage.setItem("3drossa:playground", JSON.stringify({
    version: 1,
    path: [
      { p: 0, sx: 0.5, y: 0, z: -1 },
      { p: 1, sx: -0.5, y: 0, z: -2 }
    ]
  }))`,
});

await step("open on old draft", `window.rossaButton("edit path")?.click()`, 5000);

// Back to the page's own document for the rest of the run, so every count
// below starts from somewhere known.
// Revert has to land on the PAGE's document, not on the draft it is
// discarding — it read back the draft once, because it was memoized over the
// journey the editor itself replaces on every keystroke.
await step("revert", `window.rossaLabel("revert")?.click()`, 1800);



/**
 * Somewhere with room, before adding anything.
 *
 * Both "+ add" buttons place a row at the CURRENT scroll position and refuse to
 * stack two rows on one progress — so at the top of the page, where a waypoint
 * already sits at p = 0, every add is correctly a no-op. Running the harness
 * there tests nothing and looks like a broken button.
 */
await step("scroll", `window.__rossa.scrollTo(0.47)`, 2000);

await step("open camera", `window.rossaSection("Camera")`, 600);
await step("camera: path", `window.rossaLabel("path")?.click()`);
await step("show cam rows", `document.querySelector("[data-rossa-camera-rows]")?.click()`, 600);
await step("+ camera row", `window.rossaLabel("+ point")?.click()`);
await step("+ path row", `window.rossaLabel("+ here")?.click()`);
await step("looks at sub.", `window.rossaLabel("looks at: subject")?.click()`);

// Open the Stations section, then the first station card, then rename it
// through its own input.
await step("open stations", `window.rossaSection("Stations")`, 600);
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

/**
 * A station's placement: the authored handoffs against the measured pin.
 *
 * Snapping is the interesting one, because it is the only place the editor
 * takes a number FROM the page rather than writing one to it — so the failure
 * mode is silence: a button that reports success and changes nothing, because
 * the stage never learned the scroll span.
 */
// The placement fields live on the station card, so its card has to be open.
await send("Runtime.evaluate", {
  expression: `[...document.querySelectorAll("input")].find((i) => i.value === "arrival")
    ?.closest("div")?.querySelector("button")?.click()`,
});
await sleep(1200);

/**
 * Move the station, and check the PAGE moved with it.
 *
 * "room before" is margin on the section, so the whole thing shifts and
 * `offsetTop` reports it — which means the measured pin, the editor's readout
 * and every handoff follow with no further arithmetic. The assertion is on the
 * measured pin rather than on the field, because writing a number into the
 * document and reading it back would pass just as well if the layout ignored it.
 */
const pinBefore = await evaluate(`return window.__rossa.measuredRange("arrival")`);

await step(
  "room before",
  `(() => {
     const fields = [...document.querySelectorAll("input[type=number]")];
     const room = fields.find((i) => i.previousSibling?.textContent === "room before");
     if (!room) return "no room field";
     window.rossaSetInput(room, 1.5);
   })()`,
  2000
);

const pinAfter = await evaluate(`return window.__rossa.measuredRange("arrival")`);
const shifted = pinBefore && pinAfter ? pinAfter.from - pinBefore.from : null;
console.log(
  "move station".padEnd(16),
  JSON.stringify({
    from: pinBefore && +pinBefore.from.toFixed(3),
    to: pinAfter && +pinAfter.from.toFixed(3),
    shifted: shifted === null ? null : +shifted.toFixed(3),
  })
);
if (!(shifted > 0.02)) errors.push("move station: room before did not move the pin");

// Put it back, so the steps below measure the layout the document describes.
await step(
  "room back",
  `(() => {
     const fields = [...document.querySelectorAll("input[type=number]")];
     const room = fields.find((i) => i.previousSibling?.textContent === "room before");
     if (room) window.rossaSetInput(room, 0);
   })()`,
  2000
);

/**
 * Knock the handoffs off the pin first.
 *
 * The demo's document was authored against this very layout, so its handoffs
 * already agree with the measured pin to four decimal places — and a test that
 * asserts "snapping changed something" would fail on a correct document, which
 * is worse than no test. Detune it, then assert it comes back.
 */
await step(
  "detune",
  `(() => {
     const rows = [...document.querySelectorAll("input[type=number]")];
     const arrives = rows.find((i) => i.previousSibling?.textContent === "arrives at");
     if (!arrives) return "no placement fields";
     window.rossaSetInput(arrives, 0.52);
   })()`,
  1500
);

const snapped = await evaluate(`
  // "arrival" and not "departure": the rename above orphaned the markup's
  // <Station id="launch">, so nothing pins it any more and a null measurement
  // is the correct answer rather than a bug.
  const before = window.__rossaEditor.doc.path
    .filter((r) => r.station === "arrival")
    .map((r) => r.p);
  window.__snapBefore = before;
  return { before, measured: window.__rossa.measuredRange("arrival") };
`);

await send("Runtime.evaluate", { expression: `window.rossaLabel("snap to the measured pin")?.click()` });
await sleep(1500);

const snapAfter = await evaluate(`
  const after = window.__rossaEditor.doc.path
    .filter((r) => r.station === "arrival")
    .map((r) => r.p);
  return { after, changed: after.some((p, i) => p !== window.__snapBefore[i]) };
`);
console.log("snap station".padEnd(16), JSON.stringify({ ...snapped, ...snapAfter }));

if (!snapped.measured) {
  errors.push("snap: the page never reported a measured pin");
} else {
  // Back onto the measured pin, to three decimals. The detune above put the
  // first handoff at 0.52, well clear of it.
  const want = [snapped.measured.from, snapped.measured.to].map((n) => +n.toFixed(3));
  const got = (snapAfter.after || []).map((n) => +n.toFixed(3));
  if (want.some((n, i) => Math.abs(n - got[i]) > 0.002)) {
    errors.push(`snap: landed on ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
  }
}

// The camera route's own remove, addressed by the row itself. Hunting for a
// div that "contains degrees and starts with a #" once turned this step into
// "delete a station" instead.
await step(
  "- camera row",
  `document.querySelector("[data-rossa-camera-row]")?.querySelector("button")?.click()`
);

/**
 * The product shot: stand the subject still and circle it.
 *
 * Asserted on the SCENE — where the camera and the subject actually ended up —
 * because both halves are ways for something that should not move to move, and
 * both would read back from the document as perfectly correct either way.
 */
await step("open subject", `window.rossaSection("Subject")`, 600);
await step("stand still", `window.rossaLabel("stands still")?.click()`, 1500);
await step("camera: orbit", `window.rossaLabel("orbit")?.click()`, 1500);
await step("circles subject", `window.rossaLabel("circles: the subject")?.click()`, 1200);

/**
 * Hand the camera back to the page before measuring it.
 *
 * The editor takes the camera in free mode — picking a camera path earlier in
 * this run did exactly that — and the stage's director returns early while it
 * holds it. Measuring there says the camera never moves, which is true and
 * tells you nothing about the shot.
 */
await step(
  "page view",
  `[...document.querySelectorAll("button")].find(b => /Camera: free/.test(b.textContent))?.click()`,
  2000
);

const shotStart = await evaluate(`
  const stage = window.__rossa;
  const subject = stage?.scene?.getObjectByName("rossa-subject");
  if (!subject) return { error: "no subject in the scene" };

  const read = () => ({
    subject: subject.position.toArray().map((n) => +n.toFixed(3)),
    camera: stage.camera.position.toArray().map((n) => +n.toFixed(3)),
  });

  window.__shotStart = { ...read(), doc: window.__rossaEditor?.doc.subject };
  window.rossaScrub = (t) => stage.scrollTo(t);
  return window.__shotStart;
`);

// Move the reader a long way through the page. The camera should swing; the
// subject should not have shifted by so much as a thousandth.
await send("Runtime.evaluate", { expression: `window.rossaScrub(0.85)` });
await sleep(3000);

const shotEnd = await evaluate(`
  const stage = window.__rossa;
  const subject = stage.scene.getObjectByName("rossa-subject");
  const before = window.__shotStart;
  const subjectNow = subject.position.toArray().map((n) => +n.toFixed(3));
  const cameraNow = stage.camera.position.toArray().map((n) => +n.toFixed(3));
  return {
    subjectMoved: subjectNow.some((n, i) => Math.abs(n - before.subject[i]) > 0.002),
    cameraMoved: cameraNow.some((n, i) => Math.abs(n - before.camera[i]) > 0.05),
    mode: before.doc?.mode,
    parkedAt: before.doc?.position,
    from: before.subject,
    to: subjectNow,
  };
`);
console.log("product shot".padEnd(16), JSON.stringify(shotEnd));
if (shotEnd.subjectMoved) errors.push("product shot: a fixed subject moved");

/**
 * Turn the model around, from the panel.
 *
 * The assertion is on the SCENE, not on the document. Writing
 * `subject.rotation` and checking it came back would pass just as happily if
 * useSubject ignored the field entirely — and ignoring it is exactly the bug
 * worth catching, since the whole point is a dropped-in model that flies
 * tail-first.
 */
await step("open subject", `window.rossaSection("Subject")`, 600);

const facing = await evaluate(`
  const scene = window.__rossa?.scene;
  const subject = scene && scene.getObjectByName("rossa-subject");
  if (!subject) return { error: "no subject in the scene" };
  window.__facingBefore = subject.quaternion.toArray().map((n) => +n.toFixed(4));
  return { before: window.__facingBefore };
`);

await send("Runtime.evaluate", { expression: `window.rossaLabel("-Z")?.click()` });
await sleep(2500);

const facingAfter = await evaluate(`
  const subject = window.__rossa.scene.getObjectByName("rossa-subject");
  const after = subject.quaternion.toArray().map((n) => +n.toFixed(4));
  const before = window.__facingBefore || [];
  return {
    rotation: window.__rossaEditor.doc.subject.rotation,
    turned: after.some((n, i) => Math.abs(n - (before[i] ?? 0)) > 0.05),
  };
`);
console.log("face -Z".padEnd(16), JSON.stringify({ ...facing, ...facingAfter }));
if (facingAfter.turned === false) errors.push("facing: -Z did not turn the model");

/**
 * Drag a waypoint while the orbit controls are live.
 *
 * The regression this guards: R3F dispatches its pointer events from one
 * listener on the canvas, and OrbitControls has its own listener on the SAME
 * canvas — so stopPropagation() inside a handle's onPointerDown is invisible to
 * it. Both gestures then run on one drag, and the world turns underneath the
 * point you are trying to place. The assertion is therefore not "the point
 * moved" but "the point moved AND the camera did not".
 */
const dragged = await evaluate(`
  const editor = window.__rossaEditor;
  if (!editor) return { error: "editor not mounted" };

  const canvas = document.querySelector("canvas");
  const at = editor.screenOf(0);
  if (!at || at.behind) return { error: "waypoint 0 is not on screen" };

  const before = {
    camera: editor.camera.position.toArray().map((n) => +n.toFixed(4)),
    row: JSON.parse(JSON.stringify(editor.doc.path[0])),
  };

  const rect = canvas.getBoundingClientRect();
  const send = (type, x, y) =>
    canvas.dispatchEvent(new PointerEvent(type, {
      clientX: rect.left + x, clientY: rect.top + y,
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1,
    }));

  send("pointerdown", at.x, at.y);
  for (let i = 1; i <= 8; i++) {
    const x = at.x + (110 * i) / 8;
    const y = at.y + (70 * i) / 8;
    canvas.dispatchEvent(new PointerEvent("pointermove", {
      clientX: rect.left + x, clientY: rect.top + y,
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, buttons: 1,
    }));
    window.dispatchEvent(new PointerEvent("pointermove", {
      clientX: rect.left + x, clientY: rect.top + y,
      bubbles: true, pointerId: 1, isPrimary: true, buttons: 1,
    }));
  }
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, isPrimary: true }));

  return { before, awaitingRead: true };
`);
await sleep(1200);

const dragResult = await evaluate(`
  const editor = window.__rossaEditor;
  if (!editor) return { error: "editor not mounted" };
  return {
    camera: editor.camera.position.toArray().map((n) => +n.toFixed(4)),
    row: JSON.parse(JSON.stringify(editor.doc.path[0])),
  };
`);

if (dragged.before && dragResult.row) {
  const moved = ["sx", "y"].some((k) => dragged.before.row[k] !== dragResult.row[k]);
  const cameraMoved = dragged.before.camera.some((n, i) => Math.abs(n - dragResult.camera[i]) > 1e-3);
  console.log(
    "drag".padEnd(16),
    JSON.stringify({ waypointMoved: moved, cameraMoved, row: dragResult.row })
  );
  if (!moved || cameraMoved) errors.push("drag: waypoint and camera moved together");
} else {
  console.log("drag".padEnd(16), JSON.stringify({ dragged, dragResult }));
}

/**
 * Drop a model on the page, the way someone would.
 *
 * A synthesised DragEvent with a real DataTransfer, not a call into the
 * component: the handler is on the window and reads `event.dataTransfer.files`,
 * so anything short of a genuine event tests a code path nobody takes.
 *
 * The assertion is that the file reached the REPOSITORY and the document
 * records where it went. An object URL would satisfy "the model appeared" and
 * still lose the work on the next reload, which is the failure worth catching.
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
await sleep(4000);

const written = path.resolve("examples/flight/public/models/triangle.glb");
const onDisk = await fs.stat(written).then((s) => s.size).catch(() => null);

const model = await evaluate(`
  const scene = window.__rossa?.scene;
  if (!scene) return { error: "no scene published" };

  let found = null;
  scene.traverse((o) => {
    if (o.name === "rossa-test-tri") found = o;
  });

  return {
    recorded: window.__rossaEditor?.doc.subject.model ?? null,
    inScene: !!found,
  };
`);
console.log("model drop".padEnd(16), JSON.stringify({ ...model, bytesOnDisk: onDisk }));

if (onDisk === null) errors.push("model drop: nothing was written to the repository");
if (model.recorded !== "/models/triangle.glb") {
  errors.push(`model drop: the document records ${model.recorded}`);
}

// Written into the repo on purpose, so take it back out. A harness that leaves
// files behind is one people stop running.
await fs.rm(written, { force: true });


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

if (fixtureBefore !== null) {
  const after = await fs.readFile(FIXTURE, "utf8").catch(() => null);
  if (after !== fixtureBefore) {
    errors.push("the demo's journey.json was written — a step pressed Save");
  }
  console.log("fixture".padEnd(16), after === fixtureBefore ? "untouched" : "REWRITTEN");
}

const shot = await send("Page.captureScreenshot", { format: "png" });
await fs.writeFile(path.join(OUT, "exercise.png"), Buffer.from(shot.data, "base64"));
console.log("->", "tools/out/exercise.png");

console.log(
  errors.length ? `\nERRORS:\n  ${errors.slice(0, 8).join("\n  ")}` : "\nno page errors"
);

ws.close();
proc.kill();
process.exit(errors.length ? 1 : 0);
