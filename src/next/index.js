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
/**
 * What a dropped model is allowed to be.
 *
 * An allowlist, not a denylist. This route writes a client's bytes to a path
 * under the project — a "everything except .js" rule is a list of the attacks
 * someone already thought of, and the interesting ones are always the other
 * kind. glTF and its texture and geometry companions are the whole legitimate
 * set here.
 */
const MODEL_TYPES = new Set([".glb", ".gltf", ".bin", ".png", ".jpg", ".jpeg", ".webp", ".ktx2"]);

/** 80 MB. Large enough for a detailed Sketchfab download, small enough to notice. */
const MAX_ASSET_BYTES = 80 * 1024 * 1024;

/**
 * Reduce a client-supplied filename to a safe basename.
 *
 * Every path separator, every dot segment and every character that is awkward
 * in a URL is gone before it is joined to anything. The result is then joined
 * to the assets directory and checked again — a name is not trusted because it
 * looked clean, it is checked because it is untrusted.
 */
function safeName(name) {
  const base = path.basename(String(name || "model.glb")).replace(/[^\w.-]+/g, "-");
  const extension = path.extname(base).toLowerCase();

  if (!MODEL_TYPES.has(extension)) {
    throw new Error(
      `3drossa: ${extension || "that"} is not a model file. ` +
        `Allowed: ${[...MODEL_TYPES].join(", ")}`
    );
  }

  const stem = base.slice(0, -extension.length).replace(/^[.-]+/, "") || "model";
  return `${stem}${extension}`;
}

export function createSaveRoute({
  file = "journey.json",
  root = process.cwd(),
  /**
   * Where a dropped model is written, and the URL it is served from.
   *
   * Defaults to Next's `public/` convention, which is what makes "drop it on
   * your page and you are done" true: the file lands in the repository, the
   * document records the path, and the next person to clone it gets both.
   */
  assets = "public/models",
  assetPath = "/models",
} = {}) {
  const target = path.resolve(root, file);
  const assetDir = path.resolve(root, assets);

  // A file path from config is still a path — keep it inside the project so a
  // stray "../../.." cannot reach the rest of the disk.
  for (const [label, resolved] of [["save target", target], ["asset directory", assetDir]]) {
    if (!resolved.startsWith(path.resolve(root) + path.sep)) {
      throw new Error(`3drossa: ${label} ${resolved} is outside ${root}`);
    }
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

  /**
   * Write a dropped model into the repository.
   *
   *   // app/api/rossa/model/route.js
   *   export const POST = route.PUT_ASSET;
   *
   * A separate handler rather than a mode of the same one: the document route
   * takes JSON and validates it with the engine's own parser, and this takes
   * opaque bytes it cannot inspect. Those deserve different rules, and folding
   * them together is how the strict one ends up with the loose one's checks.
   */
  async function PUT_ASSET(request) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "3drossa: saving is disabled in production." },
        { status: 403 }
      );
    }

    let name;
    let bytes;
    try {
      const form = await request.formData();
      const uploaded = form.get("file");
      if (!uploaded || typeof uploaded.arrayBuffer !== "function") {
        throw new Error("3drossa: no file in the request");
      }

      name = safeName(form.get("name") || uploaded.name);
      bytes = Buffer.from(await uploaded.arrayBuffer());

      if (bytes.length > MAX_ASSET_BYTES) {
        throw new Error(
          `3drossa: ${(bytes.length / 1e6).toFixed(1)} MB is over the ${
            MAX_ASSET_BYTES / 1e6
          } MB limit`
        );
      }
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    const destination = path.join(assetDir, name);

    // Checked again after joining. safeName produced this, but the guarantee
    // that matters is about the path that is actually written, not about the
    // function that last touched it.
    if (!destination.startsWith(assetDir + path.sep)) {
      return Response.json({ error: "3drossa: refusing to write outside the asset directory" }, { status: 400 });
    }

    try {
      await fs.mkdir(assetDir, { recursive: true });
      await fs.writeFile(destination, bytes);
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      file: path.relative(root, destination).split(path.sep).join("/"),
      // The URL the document records, and the page loads it from.
      url: `${assetPath.replace(/\/$/, "")}/${name}`,
      bytes: bytes.length,
    });
  }

  return { POST, PUT_ASSET };
}
