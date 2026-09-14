import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the real wiselab modules so the engine can be held against them.
 *
 * wiselab is the fixture, not a dependency: it is a shipped site built by hand
 * with the ideas this engine generalizes, so "does the document reproduce it
 * exactly" is the sharpest available test of whether the format is expressive
 * enough. If it cannot express wiselab, it is not an engine.
 *
 * wiselab is READ-ONLY here. Its sources import through a bundler alias
 * ("@/lib/journey") that node cannot resolve, so they are copied into
 * test/.generated/ with the alias rewritten to a relative path. Nothing is
 * written back.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..");

export const WISELAB_DIR = path.resolve(
  ROOT,
  process.env.WISELAB_DIR || "../wiselab"
);

const GENERATED = path.join(ROOT, "test", ".generated");

/** The alias every wiselab lib file uses for its own project root. */
const ALIAS = /from\s+"@\/lib\/([A-Za-z0-9_]+)"/g;

const FILES = ["journey.js", "flightPath.js"];

export async function available() {
  try {
    await fs.access(path.join(WISELAB_DIR, "lib", "flightPath.js"));
    return true;
  } catch {
    return false;
  }
}

export async function loadWiselab() {
  await fs.mkdir(GENERATED, { recursive: true });

  for (const name of FILES) {
    const source = await fs.readFile(path.join(WISELAB_DIR, "lib", name), "utf8");
    const rewritten = source.replace(ALIAS, 'from "./$1.js"');
    await fs.writeFile(path.join(GENERATED, name), rewritten, "utf8");
  }

  const flightPath = await import(
    pathToUrl(path.join(GENERATED, "flightPath.js"))
  );
  const journey = await import(pathToUrl(path.join(GENERATED, "journey.js")));

  return { flightPath, journey };
}

// Windows paths are not valid URLs; import() needs a file:// URL.
const pathToUrl = (p) => new URL(`file:///${p.replace(/\\/g, "/")}`).href;
