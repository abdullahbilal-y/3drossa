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
| **pink cube** | A camera waypoint — where the *lens* goes. Only if the document has a camera path. |
| **blue diamond** | What that camera waypoint looks at. The faint line between them is its sight line. |
| **red boxes** | Your real copy, measured from the live DOM and projected into 3D. Keep the path out of these. |

The red boxes are the point of the whole thing. They are not a diagram of your
layout — they are your actual headline, at its actual size, where it actually
sits right now.

## The panel

Sections collapse, and only the one you are working in is open — a journey has
four independent kinds of thing in it, and all four at once is one long column
of near-identical number fields. A closed section still tells you something:
how many stations there are, which camera mode is running.

Clicking a handle in the scene **opens the section that edits it**, and the line
under the scrub bar always says what you have selected, in words.

Drag the header sideways to move the panel to the other edge, or **–** to
collapse it to a stub when you need to see the copy underneath.

## Moving things

1. **Press and hold a handle**, then move the pointer. It follows exactly, in
   the plane facing the camera.
2. **Depth (`z`) is typed, not dragged.** Dragging depth with a 2D gesture is a
   guess, and `z` is the axis that decides whether the subject passes in front
   of your copy or behind it.
3. **Or type everything.** Each waypoint has `p / sx / y / z` in the panel.
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

Open a station with the arrow next to its name. Each has a start (`t: 0`) and
an end (`t: 1`), and everything in between is interpolated. A path row marked
`cocoon @ 0` **derives** from the station — it cannot drift away from it, by
construction.

| | |
| --- | --- |
| **name** | Type over it. A rename takes every waypoint that derives from the station with it. |
| **arrives at / leaves at** | Where in the scroll the spline hands off to the station. |
| **holds for** | How many viewport heights of scroll the pin consumes. |
| **subject** | Where the object sits, arriving and leaving. These have drag handles in the scene. |
| **camera** | The framing the lens takes while the station is held. Numbers only. |

The name is the contract with your markup: `<Station id="cocoon">` in your JSX
has to match. Rename one here and the matching section renders **unpinned**,
with a warning in the console, until you update the JSX — it does not break the
page, but it does stop pinning.

A station with no waypoints pointing at it shows as `unused`: it is in the
document, but no part of the scroll reaches it.

### Where a station sits

A station has **two** positions, and they move in different ways.

The **pin** is measured from your DOM — it is wherever `<Station>` sits in your
markup. The document does not get to rewrite your markup, but it does own the
space around it, and from the reader's side that is the same thing:

| | |
| --- | --- |
| **room before** | Empty scroll ahead of the pin. This is how you move a station: it pushes the whole section later, and the measured pin follows. Negative pulls it earlier, eating the slack above — too much and it overlaps the section before it. |
| **holds for** | How long the pin holds the viewport. |
| **room after** | Empty scroll behind it, before the next section. |

The gap between two stations *is* the travel section, so its length is a
choreography decision rather than a layout one — which is why it belongs here
and not only in your CSS.

The **handoffs** are the two path rows that say where the spline meets the
station: the *arrives at* / *leaves at* fields on the card. (They were always
editable — as two `p` fields buried in the Path list, several sections away from
the station they belong to, which is a fair reason to conclude a station's
position was not editable at all.)

Move a station with **room before** and the pin moves; the handoffs do not
follow on their own. The card shows the measured pin underneath them. When the two disagree, it says
so in orange, because that drift is worth catching: the subject reaches the
station's framing *before or after* the page stops, which reads as a teleport at
the boundary with no obvious cause. **snap to the measured pin** takes the
numbers the page is already reporting.

## Camera

| mode | |
| --- | --- |
| **follow** | The lens holds its viewpoint and leans toward the subject. |
| **beats** | Follows the beats track only. No lean. |
| **locked** | Never moves. Sits at `position`, looks at `target`, holds one fov. |
| **path** | Flies its own spline, bound to scroll, exactly like the subject's path. |
| **orbit** | Circles the subject, or a fixed point, at an authored angle and distance. |

**For a camera that does not move at all:** `locked`, untick *station framings
take over the camera*, and set pointer parallax to 0.

Note that `locked` locks the **field of view** too, at `camera.fov` (blank means
the document's lens fov). It used to lock position only, so the global beats
track went on nudging the fov a couple of degrees across the page — a slow zoom
that nobody asked for and that looks like the lock not working. If you *want*
the fov to breathe, use `beats`.

### The product shot

A car does not fly across the page. It stands there while the camera moves
around it — and that is two settings, not a table of coordinates:

1. **Subject → stands still.** The path is ignored entirely. Not "sampled and
   overridden": a fixed subject never touches the spline, so the progress
   binding, the handoffs and the idle drift are all out of the picture. Stations
   still pin the page and still frame the camera; they just cannot move it.
2. **Camera → orbit**, circling **the subject**.

Each orbit row is **around** (the angle you have walked round it — 0 is straight
in front), **above** (lifts the lens without changing how far away it is),
**distance**, and **fov**. Spherical rather than xyz on purpose: an orbit
hand-written as coordinates drifts off the radius, and the model lurches toward
and away from the lens. That is the commonest defect in a hand-built product
shot and very hard to see while you are the one nudging the numbers.

One row is a complete shot — a fixed camera at an authored angle.

### Camera path

Pick **path** and you get a route seeded from the camera the page already has,
so switching modes changes almost nothing on screen — you edit from where you
were, rather than from an arbitrary default.

Each row is a `p` (the scroll position it belongs to), a **position**, a
**looks at**, and an **fov**. Two splines, not one: the lens and its target move
independently, which is what lets the camera hold on something while it moves
past it. `looks at: subject` drops the target spline entirely and aims at
whatever is flying the path.

Picking the mode also hands you the camera, because in page view the lens *is*
the route — the handles would be sitting at the eye you are looking through.

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

**3. `next build` while `next dev` is running breaks the styles.** Both write
into the same `.next`, so the dev server ends up serving a production build and
cannot resolve its own CSS chunks. The tell is `BUILD_ID` or `export-marker.json`
sitting in `.next`. Stop the server, delete `.next`, start it again — the symptom
is an unstyled page, which looks nothing like a build problem.

**4. A half-deleted `.next` corrupts the manifest.** Deleting `.next` while the
dev server is running leaves it partially removed, and the page then fails with
*"Could not find the module … in the React Client Manifest"*. Stop the server
first, then delete, then start.

## Keeping your work

The editor writes `journey.json` when you press **Save**, and nothing before
that. If there is no save route — a static playground, a preview build — the
button downloads the file instead.

`autosave` keeps a **draft** in the browser as you edit:

```jsx
<JourneyEditor stage={stage} autosave="my-site" />
```

The panel then says *Draft kept in this browser*, and **revert** throws the
draft away and goes back to the file on disk. It is deliberately off by default:
writing to someone's browser is not a decision a library should make for you.

A draft is per-browser and per-key. It is not a backup, and it never reaches
your repository until you press Save.

## Your own model

**Drop a `.glb` anywhere on the page while the editor is open.** With a save
route, the file is written into your repository under `public/models/` and the
document records the path — so it survives a reload, and whoever clones the repo
next gets both halves. Nothing is uploaded anywhere; it goes through your own
dev server onto your own disk.

Render it with one component:

```jsx
import { Subject } from "3drossa/react";

<Subject stage={stage} />        // loads whatever subject.model names
```

Add the asset route next to the document one:

```js
// app/api/rossa/model/route.js
import { createSaveRoute } from "3drossa/next";
const route = createSaveRoute({ file: "app/journey.json" });
export const POST = route.PUT_ASSET;
```

`createSaveRoute` takes `assets` and `assetPath` if `public/models` and
`/models` are not where you want them. Only glTF and its texture/geometry
companions are accepted, at up to 80 MB, and only outside a production build.

You can still drive a model yourself — `useSubject(ref, stage)` on a ref of your
own is the underlying API and always was. `<Subject>` is a convenience.

Two things decide whether an imported model behaves:

- **Its origin.** The path drives the object's origin, so a model authored with
  its origin fifty units away orbits somewhere off screen. Centre it on its own
  bounding box first.
- **Which way is forward.** `useSubject` aims local **+Z** at the direction of
  travel, and a model built facing −Z flies tail-first. Open **Subject** in the
  panel and press **+Z / −Z / +X / −X** — that is the whole fix. The rotation
  fields underneath take any angle, for a model that is pitched, rolled or
  simply crooked.

**Size.** `subject.scale` is a base multiplier on top of the beats track,
because "what units was this file authored in" and "how big should it read right
now" are different questions. A model exported in centimetres should not mean
re-tuning every beat.

**Subject** also holds how it carries itself: *chase* (how hard it pulls toward
the path), *turn* (how fast it swings to a new heading), and *idle* (how much it
drifts while nobody is scrolling — 0 is perfectly still). Untick *turn to face
the direction of travel* and it holds one orientation the whole way.

On the [playground](https://abdullahbilal-y.github.io/3drossa/) you can just
drop a `.glb` on the page — it is read locally and never uploaded.

## What you cannot do yet

- **Route variants** (the same path shaped differently per user choice) are
  still code, not document data.
- **Station camera framings** are editable as numbers, but have no drag handles
  yet — only the subject keyframes and the camera path do.
- While a station is held, the subject's **heading** follows the travel spline
  rather than the station's own motion.
- Mobile is untested.
