import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeDocument, serializeDocument } from "../core/index.js";

/**
 * The save endpoint, as a Next route handler.
 *
 *   // app/api/rossa/route.js
 *   import { createSaveRoute } from "3drossa/next";
 *   const route = createSaveRoute({ file: "app/journey.json" });
 *   export const POST = route.POST;
 *
 * This is a development tool, not a feature. It writes to disk, so it refuses
 * to run in a production build, and it refuses to write outside the project.
 *
 * Nothing from the request is ever spliced into the file. The document is
 * parsed, validated by the same code the runtime uses, and re-serialized from
 * the validated result — so the worst a malformed request can do is fail. A
 * route that takes strings from a client and writes them into a source file is
 * a remote code execution hole, whoever it was meant for.
 */
export function createSaveRoute({ file = "journey.json", root = process.cwd() } = {}) {
  const target = path.resolve(root, file);

  // A file path from config is still a path — keep it inside the project so a
  // stray "../../.." cannot reach the rest of the disk.
  if (!target.startsWith(path.resolve(root) + path.sep)) {
    throw new Error(`3drossa: save target ${target} is outside ${root}`);
  }

  async function POST(request) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "3drossa: saving is disabled in production." },
        { status: 403 }
      );
    }

    let text;
    try {
      const body = await request.json();
      const document = body?.document ?? body;

      // Validated by the runtime's own parser: if the engine would not accept
      // this document, it does not reach the disk.
      text = serializeDocument(normalizeDocument(document));
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    try {
      await fs.writeFile(target, text, "utf8");
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, file: path.relative(root, target) });
  }

  return { POST };
}
