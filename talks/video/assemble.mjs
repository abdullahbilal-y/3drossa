/**
 * Cards + recorded frames -> one 1080p30 MP4 with crossfades.
 *
 *   node assemble.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FADE = 0.5;
const SEG = path.join(HERE, "segments");
mkdirSync(SEG, { recursive: true });

const plan = [
  { card: "title", d: 4.5 },
  { frames: "tour" },
  { frames: "editor" },
  { card: "tests", d: 6 },
  { card: "shake", d: 8 },
  { card: "harness", d: 8 },
  { card: "tarball", d: 6 },
  { card: "end", d: 6 },
];

const ff = (args) => {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
};

const enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30"];
const parts = [];
for (const item of plan) {
  const out = path.join(SEG, `${item.card || item.frames}.mp4`);
  if (item.card) {
    ff(["-loop", "1", "-framerate", "30", "-t", String(item.d), "-i", path.join(HERE, "cards", `${item.card}.png`), ...enc, out]);
    parts.push({ out, d: item.d });
  } else {
    const dir = path.join(HERE, "frames", item.frames);
    if (!existsSync(dir)) { console.error(`missing frames/${item.frames}`); process.exit(1); }
    const count = readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
    ff(["-framerate", "30", "-i", path.join(dir, "%05d.jpg"), ...enc, out]);
    parts.push({ out, d: count / 30 });
  }
  console.log(`${path.basename(out)}  ${parts.at(-1).d.toFixed(2)}s`);
}

// Chain xfades: each offset is the running output length minus the fade.
const inputs = parts.flatMap((p) => ["-i", p.out]);
let filter = "", last = "[0:v]", length = parts[0].d;
for (let i = 1; i < parts.length; i++) {
  const label = `[x${i}]`;
  filter += `${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${(length - FADE).toFixed(3)}${label};`;
  length += parts[i].d - FADE;
  last = label;
}
filter += `${last}fade=t=in:st=0:d=0.6,fade=t=out:st=${(length - 0.8).toFixed(3)}:d=0.8[v]`;

const final = path.join(HERE, "3drossa-demo.mp4");
ff([
  ...inputs,
  "-f", "lavfi", "-t", length.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo",
  "-filter_complex", filter,
  "-map", "[v]", "-map", `${parts.length}:a`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-shortest",
  final,
]);
console.log(`\n${final}  ${length.toFixed(1)}s`);
