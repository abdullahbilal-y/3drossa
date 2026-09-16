/**
 * Serve the exported demo the way GitHub Pages will: under /3drossa.
 *
 *   node tools/serve-pages.mjs [port]
 *
 * Serving `out/` at the root would appear to work and prove nothing — every
 * asset in the export is referenced as /3drossa/_next/..., so a root-served
 * copy either 404s or accidentally passes for the wrong reason. Mounting it at
 * the real base path is the only check worth running before publishing.
 */

import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

const PORT = Number(process.argv[2] || 4173);
const BASE = "/3drossa";
const ROOT = path.resolve("examples/flight/out");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (request, response) => {
  let url = decodeURIComponent(request.url.split("?")[0]);

  if (url === BASE) {
    response.writeHead(302, { Location: `${BASE}/` });
    response.end();
    return;
  }

  if (!url.startsWith(`${BASE}/`)) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end(`not under ${BASE}/`);
    return;
  }

  let file = path.join(ROOT, url.slice(BASE.length));
  if (url.endsWith("/")) file = path.join(file, "index.html");

  try {
    const body = await fs.readFile(file);
    response.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  }
}).listen(PORT, () => {
  console.log(`serving ${ROOT}\n  http://localhost:${PORT}${BASE}/`);
});
