/**
 * Put the exported examples together into one Pages site.
 *
 *   node tools/assemble-pages.mjs
 *
 * The flight demo is the site root (/3drossa/) and each sample sits in its own
 * folder beneath it (/3drossa/watch/, /3drossa/voyage/). Every example is
 * exported with the matching basePath already — see each next.config.mjs — so
 * this only has to copy folders, never rewrite a URL.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const SITE = path.resolve("site");

/** [example, folder under the site root] — "" is the root itself. */
const PARTS = [
  ["flight", ""],
  ["watch", "watch"],
  ["voyage", "voyage"],
];

await fs.rm(SITE, { recursive: true, force: true });

for (const [example, folder] of PARTS) {
  const from = path.resolve("examples", example, "out");
  const exists = await fs.stat(path.join(from, "index.html")).catch(() => null);
  if (!exists) {
    throw new Error(`examples/${example}/out has no index.html — export it with ROSSA_PAGES=1 first`);
  }
  await fs.cp(from, path.join(SITE, folder), { recursive: true });
  console.log(`${`examples/${example}`.padEnd(18)} -> site/${folder}`);
}
