/**
 * Writes a minimal but valid .glb, for testing the playground's model drop.
 *
 *   node tools/make-glb.mjs [out]
 *
 * Hand-built rather than exported, because a fixture that needs Blender to
 * regenerate is a fixture that rots. One triangle, one node, one mesh — enough
 * to exercise the whole path: the loader, the bounding-box fit, and the swap
 * from the built-in plane. The node is NAMED so a harness can assert it reached
 * the scene graph instead of guessing from pixels.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const out = process.argv[2] || path.resolve("tools/out/triangle.glb");

// Three vertices, +Z forward like the built-in plane, so the heading still reads.
const positions = new Float32Array([-1, -0.6, 0, 1, -0.6, 0, 0, 0.9, 1.2]);
const bin = Buffer.from(positions.buffer);

const json = {
  asset: { version: "2.0", generator: "3drossa test fixture" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "rossa-test-tri" }],
  meshes: [{ name: "rossa-test-tri", primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126, // FLOAT
      count: 3,
      type: "VEC3",
      // Required on a POSITION accessor, and three's loader uses them for the
      // bounding box — an omitted min/max is the usual reason a hand-built glb
      // loads but measures as zero-sized.
      min: [-1, -0.6, 0],
      max: [1, 0.9, 1.2],
    },
  ],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
  buffers: [{ byteLength: bin.length }],
};

/** Every chunk is 4-byte aligned: JSON padded with spaces, BIN with zeroes. */
const pad = (buffer, byte) => {
  const over = buffer.length % 4;
  if (over === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(4 - over, byte)]);
};

const jsonChunk = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
const binChunk = pad(bin, 0x00);

const chunk = (data, type) => {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(data.length, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, data]);
};

const body = Buffer.concat([chunk(jsonChunk, 0x4e4f534a), chunk(binChunk, 0x004e4942)]);

const header = Buffer.alloc(12);
header.write("glTF", 0, "ascii");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + body.length, 8);

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, Buffer.concat([header, body]));
console.log(`${path.relative(process.cwd(), out)}  ${12 + body.length} bytes`);
