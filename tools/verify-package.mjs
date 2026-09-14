import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Test the real tarball, the way npm will actually ship it.
 *
 * `npm link` and a `file:` dependency both cheat: they symlink the working
 * directory, so they never exercise the `files` allowlist, the `exports` map,
 * or the built output. A package can pass both and still be broken on install
 * — shipping source that was never compiled, or omitting a directory nobody
 * noticed was missing, because locally it was right there on disk.
 *
 * So: pack it, install the tarball into a throwaway project, and import every
 * entry point from outside.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const WINDOWS = process.platform === "win32";
const npm = WINDOWS ? "npm.cmd" : "npm";

/**
 * Since Node 20.12 / 22, spawning a `.cmd` without a shell throws EINVAL — a
 * fix for CVE-2024-27980, where arguments could break out into the command
 * line. A shell is therefore required on Windows, which means quoting anything
 * with a space ourselves: temp paths routinely contain one.
 */
const quote = (arg) => (WINDOWS && /[\s&|<>^]/.test(arg) ? `"${arg}"` : arg);

const run = (args, cwd) =>
  execFileSync(npm, WINDOWS ? args.map(quote) : args, {
    cwd,
    encoding: "utf8",
    shell: WINDOWS,
    stdio: ["ignore", "pipe", "pipe"],
  });

/**
 * `npm pack` runs `prepack`, and that build's own logging lands on stdout
 * ahead of the JSON. Slice from the first bracket rather than assuming npm had
 * the stream to itself.
 */
function parseJson(stdout) {
  const start = stdout.indexOf("[");
  if (start === -1) throw new Error(`no JSON in npm output:\n${stdout}`);
  return JSON.parse(stdout.slice(start));
}

console.log("packing…");
const packed = parseJson(run(["pack", "--json", "--pack-destination", os.tmpdir()], ROOT));
const tarball = path.join(os.tmpdir(), packed[0].filename);

console.log(`  ${packed[0].filename}  ${(packed[0].size / 1024).toFixed(1)} kB, ${packed[0].entryCount} files`);

// What a consumer actually receives. Anything surprising here is a bug in
// `files` — shipping tests, fixtures, or the whole of src by accident.
const shipped = packed[0].files.map((f) => f.path).sort();
console.log("\ncontents:");
for (const file of shipped) console.log(`  ${file}`);

const leaked = shipped.filter(
  (f) => f.startsWith("test/") || f.startsWith("tools/") || f.startsWith("examples/") || f.startsWith("src/")
);
if (leaked.length) {
  console.error(`\nFAIL: these should not ship:\n  ${leaked.join("\n  ")}`);
  process.exit(1);
}

const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "rossa-verify-"));
console.log(`\ninstalling into ${sandbox}`);

await fs.writeFile(
  path.join(sandbox, "package.json"),
  JSON.stringify({ name: "rossa-verify", private: true, type: "module", version: "0.0.0" }, null, 2)
);

run(
  [
    "install",
    "--no-audit",
    "--no-fund",
    "--loglevel=error",
    tarball,
    "react@19.2.0",
    "react-dom@19.2.0",
    "three@^0.175.0",
    "@react-three/fiber@^9.1.2",
    "@react-three/drei@^10.0.6",
  ],
  sandbox
);

await fs.writeFile(
  path.join(sandbox, "check.mjs"),
  `
import assert from "node:assert/strict";

// 1. Core has to work, standalone, with no React and no DOM.
const { Journey, makeSample, serializeDocument } = await import("3drossa");

const doc = {
  version: 1,
  stations: [{
    id: "hold",
    scroll: 2,
    subject: [{ t: 0, sx: 0.5, y: 0, z: -1, scale: 1, ease: "smoothstep" },
              { t: 1, sx: -0.5, y: 0.5, z: -2, scale: 1.2 }],
    camera:  [{ t: 0, position: [0, 0, 6], target: [0, 0, 0], fov: 38 },
              { t: 1, position: [0, 1, 6], target: [0, 0, 0], fov: 42 }],
  }],
  path: [
    { p: 0,   sx: 0.6, y: 0.7, z: -1.1 },
    { p: 0.3, station: "hold", at: 0 },
    { p: 0.7, station: "hold", at: 1 },
    { p: 1,   sx: -0.4, y: 1.2, z: -3 },
  ],
  beats: [{ at: 0, scale: 1, camY: 0, camZ: 6, fov: 38 },
          { at: 1, scale: 1.2, camY: 0.2, camZ: 6, fov: 40 }],
};

const journey = new Journey(doc);
const out = makeSample();
journey.sample(0.5, out);

assert.equal(out.station, "hold", "station should be held at p=0.5");
assert.ok(Number.isFinite(out.travel.x), "travel.x must be a number");

// The handoff property, checked from outside the package.
const framing = journey.stationSubject("hold", 0);
const at = journey.sample(0.3);
assert.ok(
  Math.abs(at.travel.x - journey.toWorldX(framing.sx, framing.z)) < 1e-6,
  "spline must meet the station exactly at its boundary"
);

assert.ok(serializeDocument(journey.doc).startsWith("{"), "serialize should produce JSON");
console.log("  core            ok");

// 2. The server entry point must not drag in anything browser-only.
const { createSaveRoute } = await import("3drossa/next");
assert.equal(typeof createSaveRoute({ file: "journey.json" }).POST, "function");
console.log("  next            ok");

// 3. The client entry points must at least resolve and parse. They are not
//    rendered here - that needs a DOM - but a broken build or a missing file
//    shows up as a resolve or syntax error right here.
for (const entry of ["3drossa/react", "3drossa/editor"]) {
  const module = await import(entry);
  const names = Object.keys(module);
  assert.ok(names.length > 0, entry + " exported nothing");
  console.log("  " + entry.padEnd(15), "ok  ->", names.join(", "));
}
`,
  "utf8"
);

console.log("\nimporting as a consumer:");
try {
  const output = execFileSync(process.execPath, ["check.mjs"], {
    cwd: sandbox,
    encoding: "utf8",
  });
  process.stdout.write(output);
} catch (error) {
  console.error(error.stdout || "");
  console.error(error.stderr || error.message);
  console.error("\nFAIL: the packaged module does not work from outside.");
  process.exit(1);
}

console.log(`\nPASS — tarball is installable and usable.\n  ${tarball}\n  sandbox: ${sandbox}`);
