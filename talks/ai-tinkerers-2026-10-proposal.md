# AI Tinkerers Islamabad / Rawalpindi — October Demo Meetup

Proposal for Saturday, October 17th, 2PM–5PM PKT. Each section below is one
field of the submission form, ready to paste.

---

## Talk Title

**My test harness lied and the AI believed it: building a 3D scroll engine with Claude Code in four days**

Alternates:

- Measure, don't read: pair-programming a 3D engine with an AI that can't see the screen
- From hand-tuned `lerp()` calls to a drag-and-drop editor: extracting 3drossa with Claude Code

---

## What did you build?

3drossa is an open-source engine for scroll-driven 3D websites. It comes with a
visual editor that runs inside your own live page, so you drag the camera and
object paths over your real copy instead of typing numbers and refreshing. I
extracted it from a hand-built production site by pairing with Claude Code.
All 19 commits are co-authored, and it took four days to go from the first
commit to an installable package with a public playground.

What I'll show live:

- **The playground.** Scroll the page, open the editor, drag a waypoint, and
  drop in a `.glb` that gets written into the repo through a Next.js route.
- **The document.** The whole experience is one plain JSON file: path, camera,
  and the "stations" where the page pins. The editor writes it back to disk.
- **The verification loop.** A node test sweeps the path at 1e-9 tolerance.
  Raw Chrome DevTools Protocol harnesses (`shot`, `shake`, `exercise`) let the
  agent check its own work in a real browser by clicking the editor's actual
  buttons.
- **Two real bugs from the git log, and how each was caught.** One was a
  camera shake that turned out to be a feedback loop: parallax re-added to a
  damped value converges to `T + p/e`, which is about 14× amplification at
  60fps. The other was a screenshot harness that read pure zeroes from every
  frame and never complained.

---

## What will another builder learn?

How to make an AI coding agent useful on a visual, real-time codebase it
cannot see. Most of this applies to any agent-assisted project, not only 3D.

1. **Lock down ground truth before the agent refactors.** Before extracting
   anything, we wrote a fidelity test that compared the new document format
   with the real site's hand-written waypoint code across 1,000 samples at
   1e-9. That made "extract an engine" a pass/fail claim. Once the site
   switched to the engine, the test was comparing the document with itself,
   so we deleted it.
2. **Put the logic where it can be checked without a browser.** The core has
   no React, DOM or WebGL, so the camera shake became a short arithmetic test.
   Headless Chrome couldn't reproduce it at all: its frame timing is too
   steady for the feedback loop to show.
3. **Your harness lies, and the agent will believe it.** `elementFromPoint`
   reports what can be clicked, not what is painted on top. Tone-mapping meant
   a handle's colour never appeared in a screenshot. Our PNG decoder assumed 4
   bytes per pixel and read zeroes out of Chrome's 3-byte screenshots. A CDP
   method every harness called doesn't exist on that domain, and it failed
   silently. The fix was to have the page report its own state
   (`window.__rossa`) instead of inferring it from pixels.
4. **Turn repeated mistakes into hard failures.** A package depending on
   itself crept into `package.json` three times, so it's now a build error. A
   harness once clicked the wrong button and overwrote the demo's fixture, so
   it now compares the fixture's bytes before and after every run.
5. **Two guesses, then replace it.** drei's `TransformControls` never received
   a single pointer event. After two plausible fixes failed, we replaced it
   with a 30-line plane raycast on an event path we knew worked.
6. **One source of truth, everywhere.** Most of the bugs came from two places
   computing the same thing. For example, two progress values (0.786 and 0.45)
   sampled different points on the same path, so the object looked like it
   wasn't following the path.
7. **Test the tarball, not the repo.** `npm link` and `file:` dependencies
   bypass the `files` allowlist, the `exports` map and the build. `npm run
   verify` packs the real tarball and installs it in a throwaway project.

If you build scroll-driven 3D: store waypoints in screen space (a fraction of
the visible width at that depth), tie them to measured page progress rather
than spacing them evenly, and give the camera two splines, one for where it
is and one for what it looks at. A single curve plus its tangent behaves like
a rollercoaster camera.

---

## Technologies Used

- **Claude Code (Claude Opus 5).** Pair programmer on every commit. It wrote
  and ran the node tests and browser harnesses and debugged from their output.
- **three.js.** Catmull-Rom splines for the object path and the camera's two
  splines (position and look-at), plus the screen-space projection math.
- **React Three Fiber.** Per-frame `useFrame` loop. Scroll writes to a mutable
  stage object instead of React state, so scrolling triggers no
  re-renders.
- **drei.** `OrbitControls` and `<Html>` for the editor overlay
  (`TransformControls` was tried and removed).
- **Next.js 15.** Hosts the demo. `createSaveRoute()` writes the JSON document
  and dropped `.glb` models into the repo. A static export serves the
  playground.
- **Node's built-in test runner.** Continuity, camera, orbit and storage tests,
  with no browser.
- **Chrome DevTools Protocol, called directly (no Puppeteer).** Screenshot and
  probe, shake measurement, and an end-to-end harness that presses the
  editor's real controls in order.
- **esbuild.** File-for-file `src → dist` build, so the core isn't inlined
  into every entry point.
- **GSAP ScrollTrigger + Lenis.** The editor was tested on a second site that
  uses them and never adopted the engine.
- **GitHub Actions + Pages.** Deploy the live playground.

---

## Links

- Project URL: https://github.com/abdullahbilal-y/3drossa
- Project URL 2: https://abdullahbilal-y.github.io/3drossa/
- Video demo: https://abdullahbilal-y.github.io/3drossa/demo.mp4
  (95s, 1080p, captioned, no voiceover; live once this branch reaches `main`
  and the Pages workflow deploys it)

---

## Before the talk

- Zoom the browser to 150–175%. The editor panel uses small type and won't be
  readable from the back of the room at 100%.
- Have one bug's commit (`1b1d286`, the camera shake) and its test
  (`test/camera.test.mjs`) open in large-font tabs. It is the clearest
  before/after in the repo.
- Run `npm run build` and restart the demo's dev server beforehand. Next does
  not watch `node_modules`.

---

## Re-rendering the video

The scripts are in `talks/video/`. The live footage is the real demo, driven in
headless Chromium on a virtual clock (one `requestAnimationFrame` step per video
frame), so it plays at a clean 30fps however slowly SwiftShader renders.

```bash
npm ci && npm run build
(cd examples/flight && npx next dev -p 3411) &   # the demo, with its save routes
node talks/video/make-rocket.mjs                  # the .glb dropped on camera
node talks/video/record.mjs                       # live frames: tour + editor
node talks/video/cards.mjs                        # title, lesson and end cards
node talks/video/assemble.mjs                     # -> examples/flight/public/demo.mp4 + demo-preview.gif
rm -r examples/flight/public/models               # the drop writes the rocket here
```

Needs a global `playwright` and `ffmpeg`. Captions live in `record.mjs`,
card text in `cards.mjs`, and segment lengths in `assemble.mjs`.
