# Using the editor

## What it is

3drossa answers one question, sixty times a second:

> Given how far the reader has scrolled, where should the object be, and where
> should the camera point?

It does **not** create a 3D scene and it does **not** give you a model. You
bring those. It is the layer that sits on top of a WebGL canvas you already
have, and the editor is how you place things without typing numbers.

---

## Opening it

Whatever button or key the host wired up. In wiselab that is the **Edit path**
button at the bottom-left, or **Ctrl+E**.

You should see your page as normal, with coloured balls and a pale line drawn
through it, and a dark panel down the right.

If you see your page but **no balls**, the library is probably stale — see
[When changes don't show up](#when-changes-dont-show-up).

## What you are looking at

| | |
| --- | --- |
| **orange ball** | A waypoint you authored. Drag these. |
| **teal ball** | A waypoint owned by a station. Not draggable here — it comes from the station's framing. Select the station instead. |
| **purple cube** | A station keyframe: where the subject sits at the start or end of a pinned section. |
| **white dot** | Where the subject is *right now*, at the current scroll position. |
| **pale line** | The path, rebuilt live as you edit. |
| **red boxes** | Your real copy, measured from the live DOM and projected into 3D. Keep the path out of these. |

The red boxes are the point of the whole thing. They are not a diagram of your
layout — they are your actual headline, at its actual size, where it actually
sits right now.

## Moving things

1. **Click a ball.** A move gizmo appears (red/green/blue arrows).
2. **Drag an arrow.** The path updates as you drag, and so does the subject.
3. **Or type.** Every waypoint has `p / sx / y / z` fields in the panel.
4. **Save to journey.json.** Writes the file; your dev server reloads.

**Scrub** with the slider at the top of the panel. It scrolls the real page, so
copy, pins and beats all move with it — you are not previewing a simulation,
you are moving the page.

## What the numbers mean

| | |
| --- | --- |
| `p` | **Where in the scroll this waypoint belongs.** 0 is the top of the page, 1 is the bottom. This is the one that stops the path drifting off the content it was written for. |
| `sx` | **How far sideways, as a fraction of the visible width at that depth.** 0 is centre, 1 is the edge of frame. Not a world coordinate — see below. |
| `y` | Height, in world units. |
| `z` | Depth. Negative is away from the viewer, positive is toward the lens. |

### Why `sx` and not a normal x

The visible width of the scene shrinks as you approach the lens. A fixed
world-x of 3.0 is a comfortable margin beside your text at `z = -1` and
completely off-screen at `z = +1.5`. Authoring as a *fraction of the frame*
makes "stay out of the copy" mean the same thing at every depth.

You never type `sx` while dragging — the editor converts your drag from world
space into screen space for you. That conversion is the reason this exists
rather than a generic spline editor.

## Stations

A **station** is a section that pins: the page stops, the copy arrives on beats,
and the subject plays to that station's framing rather than continuing along
the path.

Click a station name in the panel to edit its keyframes. Each station has a
start (`t: 0`) and an end (`t: 1`), and the subject is interpolated between
them. A path row marked `cocoon @ 0` **derives** from the station — it cannot
drift away from it, by construction.

## Camera

| mode | |
| --- | --- |
| **follow** | The lens holds its viewpoint and leans toward the subject. |
| **beats** | Follows the beats track only. No lean. |
| **locked** | Never moves. Sits at `position`, looks at `target`. |

**For a camera that does not move at all:** `locked`, untick *station framings
take over the camera*, and set pointer parallax to 0.

Everything below the mode buttons — the lean amounts, parallax, the four
damping rates — is saved into the document like anything else.

Parallax defaults to **0**. It is the first thing that makes a still shot feel
unsteady.

### Camera: page view / free

- **page view** (default) — you see the scene exactly as the reader will,
  through the page's own camera. This is where you judge whether the path works.
- **free** — the editor takes the camera, frames the whole path and lets you
  orbit. For inspecting the *shape* of the path, not its relationship to copy.

---

## Adding it to a site

You need React, `@react-three/fiber`, `three`, and something to move.

```jsx
const stage = useMemo(() => createStage(journeyDocument), []);

<Canvas>
  {/* your scene */}
  {process.env.NODE_ENV !== "production" && editing
    ? <JourneyEditor stage={stage} />
    : null}
</Canvas>
```

Plus one route so Save can write:

```js
// app/api/rossa/route.js   — NOT _rossa; Next excludes underscore folders
import { createSaveRoute } from "3drossa/next";
const route = createSaveRoute({ file: "lib/journey.json" });
export const POST = route.POST;
```

You do **not** need `<Stage>` or `<Station>`. The editor samples the journey
itself. If your page already pins with GSAP/ScrollTrigger and drives its own
camera — as wiselab does — leave all of that alone.

**If your page has its own camera director**, give it a way to stand aside:

```js
if (stage?.editing) return;   // the editor has the camera in free mode
```

**If you use Lenis or similar**, the scrub bar finds `window.__lenis` or
`window.lenis` automatically. Otherwise pass your own:

```js
createStage(doc, { scrollTo: (top) => lenis.scrollTo(top, { immediate: true }) });
```

---

## When changes don't show up

Three traps, all of which cost real time during development:

**1. A same-version tarball is not reinstalled.** `npm install ../x/x-0.1.0.tgz`
does nothing if `0.1.0` is already in the lockfile — npm serves its cached copy
and you keep running the old build. **Bump the version.** That is what versions
are for.

**2. `node_modules` is not watched.** After installing a new build, **restart
the dev server**. Next will happily serve a compiled copy of the old one.

**3. A half-deleted `.next` corrupts the manifest.** Deleting `.next` while the
dev server is running leaves it partially removed, and the page then fails with
*"Could not find the module … in the React Client Manifest"*. Stop the server
first, then delete, then start.

## What you cannot do yet

- **Route variants** (the same path shaped differently per user choice) are
  still code, not document data.
- **Station camera framings** are in the document and editable as numbers, but
  have no drag handles yet — only the subject keyframes do.
- While a station is held, the subject's **heading** follows the travel spline
  rather than the station's own motion.
- Mobile is untested.
