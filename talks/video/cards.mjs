/**
 * Renders the static cards (title, lessons, end) to 1920x1080 PNGs.
 *
 *   node cards.mjs
 */

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

// Playwright is not a dependency of the package; use a global install.
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium } = require("playwright");
const HERE = path.dirname(new URL(import.meta.url).pathname);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const base = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1920px; height: 1080px; background: #0e1418; color: #f6f1e9; font-family: Inter, sans-serif; }
  body { padding: 120px 150px; display: flex; flex-direction: column; justify-content: center; position: relative; overflow: hidden; }
  body::before { content: ""; position: absolute; inset: 0;
    background: radial-gradient(1200px 700px at 85% 15%, rgba(47,179,163,0.10), transparent 60%),
                radial-gradient(900px 600px at 10% 100%, rgba(245,166,35,0.08), transparent 60%); }
  .kick { font-size: 22px; letter-spacing: 0.28em; color: #f5a623; font-weight: 600; text-transform: uppercase; margin-bottom: 28px; position: relative; }
  h1 { font-family: "Inter Display", Inter, sans-serif; font-size: 150px; font-weight: 700; letter-spacing: -0.035em; line-height: 0.95; position: relative; }
  h2 { font-family: "Inter Display", Inter, sans-serif; font-size: 72px; font-weight: 650; letter-spacing: -0.025em; line-height: 1.05; position: relative; max-width: 1600px; }
  .sub { font-size: 40px; line-height: 1.35; color: rgba(246,241,233,0.78); margin-top: 30px; max-width: 1450px; position: relative; }
  .foot { font-size: 30px; color: rgba(246,241,233,0.6); margin-top: 70px; position: relative; }
  .foot b { color: #2fb3a3; font-weight: 600; }
  pre { position: relative; margin-top: 50px; background: #080c0f; border: 1px solid rgba(255,255,255,0.10); border-radius: 18px;
    padding: 34px 42px; font: 500 29px/1.5 "DejaVu Sans Mono", monospace; color: #d8d3cb; max-width: 1620px; white-space: pre; }
  pre .p { color: #f5a623; } pre .ok { color: #2fb3a3; } pre .dim { color: rgba(216,211,203,0.45); } pre .bad { color: #ef6b5b; }
  ul { list-style: none; margin-top: 46px; position: relative; }
  li { font-size: 38px; line-height: 1.3; padding: 16px 0 16px 46px; position: relative; color: rgba(246,241,233,0.88); }
  li::before { content: ""; position: absolute; left: 4px; top: 33px; width: 16px; height: 16px; border-radius: 50%; background: #ef6b5b; }
  li code, .sub code { font-family: "DejaVu Sans Mono", monospace; font-size: 0.86em; color: #f6f1e9; background: rgba(255,255,255,0.07); padding: 2px 10px; border-radius: 6px; }
  .fix { margin-top: 40px; font-size: 38px; font-weight: 600; color: #f5a623; position: relative; }
  .eq { margin-top: 36px; font: 600 44px "DejaVu Sans Mono", monospace; color: #f6f1e9; position: relative; }
  .eq span { color: #f5a623; }
  .links { margin-top: 60px; font: 500 34px "DejaVu Sans Mono", monospace; color: #2fb3a3; line-height: 1.6; position: relative; }
`;

const cards = {
  title: `
    <div class="kick">AI Tinkerers Islamabad / Rawalpindi · Oct 17</div>
    <h1>3drossa</h1>
    <div class="sub">A scroll-driven 3D engine, and an editor that runs inside your own page.</div>
    <div class="foot">Built in four days, pairing with <b>Claude Code</b>. 19 commits, every one co-authored.</div>`,

  tests: `
    <div class="kick">Checkable without a browser</div>
    <h2>The core has no React, no DOM, no WebGL.</h2>
    <div class="sub">So the whole journey is swept in node and asserted on.</div>
    <pre><span class="p">$</span> npm test
<span class="dim">▶</span> continuity
  <span class="ok">✔</span> the travel path never jumps
  <span class="ok">✔</span> the spline meets each station exactly at its boundaries
<span class="dim">▶</span> camera path
  <span class="ok">✔</span> the lens is AT each waypoint at that waypoint's progress
  <span class="ok">✔</span> the lens never jumps
<span class="dim">  …</span>
<span class="ok">ℹ tests 23   ℹ pass 23   ℹ fail 0</span></pre>`,

  shake: `
    <div class="kick">Bug: the camera shook at every station</div>
    <h2>It wasn't rendering. It was arithmetic.</h2>
    <pre><span class="bad">// wrong: the offset lands on a value that already holds it</span>
camera.position.lerp(target, ease);
camera.position.x += parallax.x;

<span class="ok">// right: damp toward target + offset, once</span>
camera.position.lerp(target + parallax, ease);</pre>
    <div class="eq">x = x(1−e) + T·e + p  →  x = T + p/e  <span>≈ 14× at 60fps</span></div>
    <div class="sub">Headless Chrome couldn't reproduce it, because its frame timing is too steady. So it's a node test: <code>test/camera.test.mjs</code></div>`,

  harness: `
    <div class="kick">Lesson: the harness lies</div>
    <h2>…and the agent believes it.</h2>
    <ul>
      <li><code>elementFromPoint</code> reports what's clickable, not what's painted on top</li>
      <li>Tone-mapping: the handle's colour never appears in a screenshot</li>
      <li>The PNG decoder read zeroes from 3-byte screenshots, and never complained</li>
      <li>A CDP method every harness called doesn't exist there, and it failed silently</li>
    </ul>
    <div class="fix">Fix: ask the page where it is (window.__rossa), don't guess from pixels.</div>`,

  tarball: `
    <div class="kick">Test the tarball, not the repo</div>
    <h2><code style="font-size:0.8em">npm link</code> and <code style="font-size:0.8em">file:</code> skip your build, files and exports.</h2>
    <pre><span class="p">$</span> npm run verify
packing…
  3drossa-0.3.0.tgz  44.2 kB, 25 files
installing into /tmp/rossa-verify-…
importing as a consumer:
  core            <span class="ok">ok</span>
  next            <span class="ok">ok</span>
  3drossa/react   <span class="ok">ok</span>  -> Stage, Station, Subject, createStage, …
  3drossa/editor  <span class="ok">ok</span>  -> JourneyEditor, Occlusion
<span class="ok">PASS — tarball is installable and usable.</span></pre>`,

  end: `
    <div class="kick">AI Tinkerers Islamabad / Rawalpindi · Sat Oct 17</div>
    <h2 style="font-size:84px">My test harness lied and the AI believed it</h2>
    <div class="sub">Building a 3D scroll engine with Claude Code in four days. Abdullah Bilal</div>
    <div class="links">github.com/abdullahbilal-y/3drossa<br>abdullahbilal-y.github.io/3drossa</div>`,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await fs.mkdir(path.join(HERE, "cards"), { recursive: true });
for (const [name, body] of Object.entries(cards)) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head><body>${body}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(HERE, "cards", `${name}.png`) });
  console.log("card", name);
}
await browser.close();
