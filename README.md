# 3drossa

An engine for scroll-driven 3D experiences — and a visual editor that runs
**inside your own page**, so you drag the path over your real copy instead of
typing numbers and refreshing.

**Live demo: https://abdullahbilal-y.github.io/3drossa/** — scroll it.

```bash
npm install 3drossa
```

---

## Why

Sites are turning from pages you scroll into places you move through. Building
one today means hand-authoring numbers: a table of waypoints, a `lerp()` per
camera framing, and a browser refresh between every guess.

3drossa is that work, extracted. The whole experience — the path, the camera,
the moments the page stops — is one plain-data document, and the editor writes
it back to disk.

**New here? Read [USAGE.md](USAGE.md)** — what the editor shows, what the numbers mean, and the three reasons a change appears not to take effect.

## The idea in three parts

**Stations and travel.** A *station* pins the viewport for a fixed run of
scroll: the page stops, the camera takes up a written framing, and your copy
arrives on beats inside the held frame. Between stations the pin releases and
the subject travels. This is what makes a page read as a place rather than as a
stack of sections.

**Waypoints live in screen space.** A waypoint's `sx` is a fraction of the
visible half-width *at that waypoint's depth*, not a world x. It has to be: the
visible width shrinks as you approach the lens, so a world-x that clears your
text column at `z = -1` is off-screen at `z = +1.5`. Authoring in `sx` makes
"stay out of the copy" mean the same thing at every depth.

**Waypoints are bound to measured progress.** Each one declares the page
progress it belongs to, so the subject is *at* that waypoint when the reader is
at that point in the page. Spacing waypoints evenly does not work — sections
are wildly different heights, and an evenly spaced spline drifts off the
content it was written for.

## Quick start

```jsx
"use client";
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Stage, Station, createStage, useSubject } from "3drossa/react";
import { JourneyEditor } from "3drossa/editor";
import journey from "./journey.json";

function Model() {
  const ref = useRef();
  useSubject(ref, stage);          // position, scale and heading, per frame
  return <mesh ref={ref}>…</mesh>;
}

export default function Page() {
  const stage = useMemo(() => createStage(journey), []);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: -1 }}>
        <Canvas camera={{ position: [0, 0, 6], fov: 38 }}>
          <Stage stage={stage}>
            <Model />
            {process.env.NODE_ENV !== "production" && <JourneyEditor stage={stage} />}
          </Stage>
        </Canvas>
      </div>

      <main>
        <section>…ordinary copy…</section>

        <Station stage={stage} id="launch">
          <h2 data-beat="0.05" data-beat-out="0.42">A station pins the page.</h2>
          <p  data-beat="0.5">Three statements, one frame.</p>
        </Station>
      </main>
    </>
  );
}
```

To let the editor save, add one route:

```js
// app/api/rossa/route.js
import { createSaveRoute } from "3drossa/next";
const route = createSaveRoute({ file: "app/journey.json" });
export const POST = route.POST;
```

Two Next constraints are load-bearing: the folder must **not** start with an
underscore (Next treats `_folder` as private and excludes it from routing), and
`POST` must be a plain named export.

### Why `stage` is passed explicitly

R3F's `<Canvas>` is a separate reconciler root, so **React context does not
cross it**. `<Station>` lives in the DOM and `<Stage>` lives in the scene, and
they share one mutable object. It is also not a module singleton: that breaks
two stages on one page and leaks between requests under SSR.

Scroll never touches React state. GSAP or the built-in loop writes to the stage,
`useFrame` reads it, and the scroll pipeline costs zero reconciliations.

## The editor

Press your toggle and the editor mounts over the live page.

| | |
| --- | --- |
| **red volumes** | Your **real copy**, measured from the live DOM and projected into the scene. Drawn as volumes, not rectangles, because the constraint is three-dimensional. |
| **yellow handles** | Authored waypoints. Drag them — in world space, stored as screen space. |
| **teal handles** | Waypoints derived from a station. Shown, not draggable. |
| **purple handles** | Station keyframes — the subject framing for a pinned moment. |
| **pink / blue handles** | The camera's own route: where the lens goes, and what it looks at. |
| **white dot** | Where the subject is at the current scroll position. |
| **scrub bar** | Scrolls the real page, so copy, pins and beats all move with it. |

Dragging against your actual layout is the point. A standalone editor can only
draw an abstraction of the page — a single "the text column is 79% of the frame"
wedge — and you author against that guess.

**Station framings are editable here.** In a hand-built site those live inside
`(t, out) => { out.x = lerp(...) }` and can only be changed by editing code.
Every framing turns out to be two keyframes and an easing, so travel waypoints
and station framings share one format, and one tool edits both.

**Drafts.** `<JourneyEditor autosave="my-site" />` keeps your edits in the
browser as you make them, so a reload mid-session costs nothing. It is a draft,
not a save: the file on disk is untouched until you press Save. Off by default —
writing to someone's browser is not a decision a library should make for you.

## Documents

```jsonc
{
  "version": 1,
  "lens":   { "z": 5.9, "fov": 38, "aspect": 1.6 },  // the screen-space reference frame
  "column": 0.79,                                     // fallback keep-out, if no DOM to measure

  "camera": {
    "mode": "follow",                                 // follow | beats | locked | path
    "stations": true,                                 // do station framings take over?
    "parallax": { "x": 0, "y": 0 }
  },

  // The camera's OWN route, when mode is "path". World space, because a camera
  // position is a place in the world — not a fraction of the frame it defines.
  "cameraPath": [
    { "p": 0,    "position": [0, 0, 6],    "target": [0, 0, 0], "fov": 38, "ease": "smoothstep" },
    { "p": 0.55, "position": [4, 1.2, 2],  "target": [0, 0.3, 0], "fov": 46 },
    { "p": 1,    "position": [-2, 2, 5.5], "target": [0, 1, 0],  "fov": 38 }
  ],

  "stations": [{
    "id": "launch",
    "scroll": 2.2,                                    // pinned length, in viewport heights
    "camera":  [{ "t": 0, "position": [1,-0.2,3.2], "target": [0.7,-0.3,0],
                  "fov": 34, "ease": "smoothstep" },
                { "t": 1, "position": [-0.2,0.7,6.4], "target": [0.1,0.3,0], "fov": 40 }],
    "subject": [{ "t": 0, "sx": 0.44, "y": 0.35, "z": 1.2, "scale": 0.8,
                  "ease": "smoothstep", "scaleEase": "linear" },
                { "t": 1, "sx": -0.36, "y": -0.85, "z": -0.6, "scale": 1.15 }]
  }],

  "path": [
    { "p": 0.0,    "sx": 0.6, "y": 0.7, "z": -1.1 },
    { "p": 0.1163, "station": "launch", "at": 0 },     // derived, never duplicated
    { "p": 0.3721, "station": "launch", "at": 1 }
  ],

  "beats": [{ "at": 0, "scale": 0.7, "camY": 0, "camZ": 6, "fov": 38, "ease": "smootherstep" }]
}
```

**Channels are discovered, not declared.** A keyframe can carry channels the
engine has never heard of — a fog density, a light colour — and they interpolate
and round-trip untouched. `ease` sets a segment's easing; `<channel>Ease`
overrides one channel.

**The camera is two splines, not one.** Where the lens *is* and what it looks
*at* move independently. A single curve plus its tangent gives you a
rollercoaster — the lens can only face the way it is travelling, so it can never
hold on something while it moves past it, which is the shot a camera path is
wanted for in the first place. (`camera.pathTarget: "subject"` drops the second
spline and aims at whatever is flying the path.)

**A path row can derive from a station** (`{ station, at }`) instead of stating
a position. A station overrides the subject while it is held, so the path's only
job at a boundary is to hand off. Maintained separately, the two drift every
time a station is retuned — and the drift reads as the subject teleporting.
Deriving makes it impossible rather than merely unlikely.

## Checkable without a browser

`3drossa` (core) has no React, no DOM and no WebGL. That is a constraint, not a
layering accident: it means a whole experience can be swept in node and asserted
against.

```js
import { Journey, makeSample } from "3drossa";

const journey = new Journey(doc);
const out = makeSample();

for (let p = 0; p <= 1; p += 0.001) {
  journey.sample(p, out);        // subject, camera, beats, station, stationT
}
```

The test suite sweeps a real shipped site's journey at 1e-9 and asserts two
properties that otherwise can only be seen by instrumenting a running page: the
path never jumps, and the spline meets every station exactly at its boundaries.

Damping and blending are deliberately **not** in core. `sample()` reports where
the path is and where the station wants the subject; easing between them over
time is runtime state and belongs to the renderer.

## Accessibility

`prefers-reduced-motion` disables pinning and beat staging entirely, and the
content renders as an ordinary document. A viewport that only releases after
several screens of scrolling is exactly what makes motion-sensitive readers
leave. This is not a degraded mode — it is the same content without the
choreography.

## Tooling

```bash
npm run build                                         # src/ -> dist/, file for file
npm test                                              # fidelity + continuity, no browser
npm run verify                                        # pack the tarball and install it for real
node tools/shot.mjs <url> <prefix> [progress ...]      # screenshot + probe at each stop
node tools/editor.mjs [url] [progress]                 # open the overlay and capture it
node tools/exercise.mjs [url]                          # press the editor's own controls, in order
node tools/make-glb.mjs                                # a 492-byte .glb fixture
```

`exercise.mjs` is the browser half of the test suite. Every step is a click or a
keystroke on a control a developer would use — nothing reaches into React state —
so the ordering failures live only here: a document that references a station the
live journey has not heard of yet, or a rename that leaves path rows pointing at
the old id.

**After `npm run build`, restart the example's dev server.** Next does not watch
`node_modules`, so it will serve a compiled copy of the previous build and you
will debug a fix that is already on disk.

`window.__rossa` is published in development by the **mounted** `<Stage>`, so a
harness can ask the page where it thinks it is.

## Testing a release before publishing

`npm link` and a `file:` dependency both **cheat**: they symlink the working
directory, so they never exercise the `files` allowlist, the `exports` map, or
the built output. A package can pass both and still be broken the moment
someone installs it — shipping source that was never compiled, or omitting a
directory that happened to be sitting right there on disk.

`npm run verify` does the honest version:

1. `npm pack` (which runs the build), then prints every file in the tarball —
   anything from `src/`, `test/`, `tools/` or `examples/` is a failure.
2. Installs that tarball into a throwaway project outside the repo, with real
   peer dependencies.
3. Imports all four entry points from outside and asserts core actually works —
   including that the spline meets a station exactly at its boundary.

```
3drossa-0.1.0.tgz  20.6 kB, 20 files
  core            ok
  next            ok
  3drossa/react   ok  -> Stage, Station, createStage, stageBeats, useSubject
  3drossa/editor  ok  -> JourneyEditor, Occlusion
PASS — tarball is installable and usable.
```

The demo is the second half of the test. It depends on the package by path and
**does not** list `3drossa` in `transpilePackages` — so if the build ever stops
emitting compiled ESM, the demo stops building. Run it against the packed
output:

```bash
npm run build && cd examples/flight && npm run dev    # localhost:3411
```

To try it in a project of your own before anything is on the registry, install
the tarball directly:

```bash
npm pack                                   # writes 3drossa-0.1.0.tgz
cd ../your-project
npm install ../3drossa/3drossa-0.1.0.tgz
```

That is byte-for-byte what `npm install 3drossa` would give you.

### On version numbers

A published version can never be reused. Unpublishing works only within 72
hours, and afterwards the name is burned for everyone, including you. So the
number is a promise, not a label:

- `0.x.y` — anything may break in any release. Consumers know to pin.
- `1.0.0` — the API is stable; breaking it now requires `2.0.0`.

This README says the API will move, so the honest number is `0.x`. Use
`npm publish --dry-run` first; it prints exactly what `npm run verify` packs,
without touching the registry.

## Entry points

| | |
| --- | --- |
| `3drossa` | Core runtime. Pure, dependency-light (three only). |
| `3drossa/react` | `createStage`, `<Stage>`, `<Station>`, `useSubject`. |
| `3drossa/editor` | The overlay. Dev-only; pulls drei. |
| `3drossa/next` | `createSaveRoute()`. |

## Status

Early. The format is proven against one real site and one demo; the API will
move. Known gaps:

- Route **variants** (the same path shaped differently per user choice) are a
  code hook, not document data.
- **Station camera framings** are editable as numbers but have no drag handles;
  the subject keyframes and the camera path do.
- While a station is held, heading still follows the travel spline rather than
  the station's own motion.
- Only a Next save adapter ships. Vite is next.
- Mobile is untested.

## Licence

MIT.
