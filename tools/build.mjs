import { build } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Compile src/ -> dist/, file for file.
 *
 * NOT bundled, deliberately. Bundling each entry point separately would inline
 * core into both the react and editor bundles, giving the consumer two copies
 * of the Journey class — so `instanceof` would start lying, and every byte of
 * core would ship twice. Transforming per file keeps one module graph, keeps it
 * tree-shakeable, and keeps stack traces pointing at real files.
 *
 * JSX lives in .js files on purpose: esbuild does not rewrite import specifiers
 * when it is not bundling, so a `./Panel.jsx` import would still say `.jsx`
 * after `Panel.jsx` had become `Panel.js` in dist, and the published package
 * would fail to resolve its own modules.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

async function sources(dir) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sources(full)));
    else if (entry.name.endsWith(".js")) found.push(full);
  }
  return found;
}

const entryPoints = await sources(SRC);

await fs.rm(DIST, { recursive: true, force: true });

await build({
  entryPoints,
  outdir: DIST,
  outbase: SRC,
  bundle: false,
  format: "esm",
  platform: "neutral",
  target: ["es2022", "node18"],
  // Automatic runtime: consumers get jsx-runtime imports rather than needing
  // React in scope, which is what every modern bundler expects.
  jsx: "automatic",
  loader: { ".js": "jsx" },
  logLevel: "warning",
});

/**
 * Put back any "use client" directive esbuild dropped.
 *
 * esbuild treats a leading string expression as dead code and removes it when
 * it is not bundling. Without the directive, Next's App Router treats these as
 * Server Components — and the first thing a consumer sees is "useState only
 * works in a Client Component", pointing into node_modules with no explanation.
 */
let restored = 0;

for (const entry of entryPoints) {
  const source = await fs.readFile(entry, "utf8");
  if (!/^\s*["']use client["']/.test(source)) continue;

  const target = path.join(DIST, path.relative(SRC, entry));
  const output = await fs.readFile(target, "utf8");
  if (/^\s*["']use client["']/.test(output)) continue;

  await fs.writeFile(target, `"use client";\n${output}`, "utf8");
  restored++;
}

const built = await sources(DIST);
console.log(
  `built ${built.length} files -> dist/` +
    (restored ? `, restored "use client" in ${restored}` : "")
);
