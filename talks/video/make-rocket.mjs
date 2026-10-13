// A low-poly rocket as a .glb, nose on +Z like the demo's paper plane.
import * as THREE from "three";
import { promises as fs } from "node:fs";
import path from "node:path";

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "rocket.glb");

const parts = [];
const add = (geo, color, metal = 0.1, rough = 0.5) =>
  parts.push({ geo: geo.index ? geo.toNonIndexed() : geo, color, metal, rough });

const body = new THREE.CylinderGeometry(0.32, 0.36, 1.6, 12, 1); body.rotateX(Math.PI / 2);
add(body, [0.93, 0.92, 0.88]);
const nose = new THREE.ConeGeometry(0.32, 0.7, 12); nose.rotateX(Math.PI / 2); nose.translate(0, 0, 1.15);
add(nose, [0.95, 0.55, 0.14]);
const band = new THREE.CylinderGeometry(0.335, 0.335, 0.16, 12); band.rotateX(Math.PI / 2); band.translate(0, 0, 0.45);
add(band, [0.2, 0.62, 0.6]);
const win = new THREE.SphereGeometry(0.12, 10, 6); win.scale(1, 1, 0.5); win.translate(0, 0.3, 0.1);
add(win, [0.25, 0.75, 0.85], 0.3, 0.2);
for (let i = 0; i < 3; i++) {
  const fin = new THREE.BufferGeometry();
  const v = new Float32Array([0, 0.3, -0.8, 0, 0.75, -1.0, 0, 0.3, -0.2]);
  fin.setAttribute("position", new THREE.BufferAttribute(v, 3));
  const fin2 = fin.clone(); fin2.index = null;
  const back = new THREE.BufferGeometry(); back.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0.3, -0.8, 0, 0.3, -0.2, 0, 0.75, -1.0]), 3));
  for (const g of [fin, back]) { g.rotateZ((i * 2 * Math.PI) / 3); g.computeVertexNormals(); add(g, [0.95, 0.55, 0.14]); }
}
const nozzle = new THREE.CylinderGeometry(0.22, 0.3, 0.25, 12, 1, true); nozzle.rotateX(Math.PI / 2); nozzle.translate(0, 0, -0.92);
add(nozzle, [0.3, 0.3, 0.32], 0.6, 0.4);

// Pack: one mesh per part, non-indexed, POSITION + NORMAL.
const buffers = []; let offset = 0;
const json = { asset: { version: "2.0", generator: "3drossa demo video" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
parts.forEach((part, i) => {
  part.geo.computeVertexNormals();
  const pos = part.geo.getAttribute("position").array;
  const nor = part.geo.getAttribute("normal").array;
  const box = new THREE.Box3().setFromBufferAttribute(part.geo.getAttribute("position"));
  const view = (arr) => {
    const buf = Buffer.from(new Float32Array(arr).buffer);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target: 34962 });
    buffers.push(buf); offset += buf.length;
    return json.bufferViews.length - 1;
  };
  const count = pos.length / 3;
  json.accessors.push({ bufferView: view(pos), componentType: 5126, count, type: "VEC3", min: box.min.toArray(), max: box.max.toArray() });
  const pa = json.accessors.length - 1;
  json.accessors.push({ bufferView: view(nor), componentType: 5126, count, type: "VEC3" });
  const na = json.accessors.length - 1;
  json.materials.push({ pbrMetallicRoughness: { baseColorFactor: [...part.color, 1], metallicFactor: part.metal, roughnessFactor: part.rough }, doubleSided: true });
  json.meshes.push({ name: `rocket-${i}`, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, material: i }] });
  json.nodes.push({ mesh: i, name: `rocket-${i}` });
  json.scenes[0].nodes.push(i);
});
const bin = Buffer.concat(buffers);
json.buffers.push({ byteLength: bin.length });
let jsonBuf = Buffer.from(JSON.stringify(json));
while (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.from(" ")]);
let binBuf = bin; while (binBuf.length % 4) binBuf = Buffer.concat([binBuf, Buffer.alloc(1)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
const chunk = (buf, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(buf.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, buf]); };
await fs.writeFile(OUT, Buffer.concat([header, chunk(jsonBuf, 0x4e4f534a), chunk(binBuf, 0x004e4942)]));
console.log(OUT, (await fs.stat(OUT)).size, "bytes");
