"use client";

import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas } from "@react-three/fiber";
import { Stage, Station, Subject, createStage } from "3drossa/react";
import journeyDocument from "./journey.json";
import Cassini from "./Cassini.jsx";
import Scenery from "./Scenery.jsx";
import { DropBadge, DropCue, DroppedOr, useModelDrop } from "./ModelDrop.jsx";

const JourneyEditor = dynamic(() => import("3drossa/editor").then((m) => m.JourneyEditor), { ssr: false });

const DEV = process.env.NODE_ENV !== "production";
const SAVE_ENDPOINT = DEV ? "/api/rossa" : null;

function Kicker({ children }) {
  return <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-sol/80">{children}</p>;
}

/** A station's two headlines share one cell, so the second replaces the first. */
function Swap({ first, second }) {
  return (
    <div className="grid">
      <h2
        data-beat="0.04"
        data-beat-out="0.34"
        className="col-start-1 row-start-1 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl"
      >
        {first}
      </h2>
      <p
        data-beat="0.48"
        className="col-start-1 row-start-1 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl"
      >
        {second}
      </p>
    </div>
  );
}

export default function Page() {
  const stage = useMemo(() => createStage(journeyDocument), []);
  const [editing, setEditing] = useState(false);
  const { model, notice, over, reset } = useModelDrop({ editorWrites: editing && !!SAVE_ENDPOINT });

  return (
    <>
      <div className="fixed inset-0 -z-10">
        <Canvas camera={{ position: [0, 0, 6], fov: 38, far: 600 }} dpr={[1, 2]}>
          <color attach="background" args={["#04060b"]} />
          <ambientLight intensity={0.14} />
          {/* The sun, far off to the left: every planet shows a terminator. */}
          <directionalLight position={[-10, 3.5, 3]} intensity={2.6} color="#fff1dc" />
          <directionalLight position={[6, -2, 4]} intensity={0.12} color="#6d8cff" />

          <Stage stage={stage}>
            <Scenery stage={stage} />
            <Subject stage={stage}>
              <Suspense fallback={null}>
                <DroppedOr url={model?.url} size={1.4}>
                  <Cassini />
                </DroppedOr>
              </Suspense>
            </Subject>
            {editing ? (
              <JourneyEditor stage={stage} endpoint={SAVE_ENDPOINT} autosave="3drossa:voyage" />
            ) : null}
          </Stage>
        </Canvas>
      </div>

      <header className="fixed inset-x-0 top-0 z-[2147483003] flex items-center justify-between bg-gradient-to-b from-void via-void/70 to-transparent px-6 pb-8 pt-5 md:px-10">
        <div className="font-mono text-sm tracking-[0.4em]">CASSINI</div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">
            <DropBadge model={model} notice={notice} reset={reset} idle="drop a .glb to fly your own craft" />
          </span>
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded border border-white/25 bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur"
          >
            {editing ? "Close editor" : "Edit path"}
          </button>
        </div>
      </header>

      <DropCue over={over} label="Drop a .glb to fly it to Saturn" />

      <main id="page" className="legible relative">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-xl">
            <Kicker>Cassini–Huygens · 1997 – 2004</Kicker>
            <h1 className="text-5xl font-semibold leading-[1] tracking-tight md:text-8xl">
              Seven years to Saturn.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-star/70">
              Scroll to fly it. The spacecraft is NASA’s own model of Cassini. Its path, the camera and every
              planet you pass are keyframes in one document, bound to how far down the page you are.
            </p>
          </div>
        </section>

        {/* ── Station: launch ──────────────────────────────────── */}
        <Station stage={stage} id="launch" className="px-6 md:px-14">
          <div className="max-w-md">
            <Kicker>15 October 1997</Kicker>
            <Swap first="5,712 kilograms leave Earth." second="Too heavy to fly straight there." />
            <p data-beat="0.7" className="mt-6 max-w-sm text-base leading-relaxed text-star/70">
              No rocket could send that much directly to Saturn. So Cassini borrowed speed instead — from
              Venus twice, from Earth once, and finally from Jupiter.
            </p>
          </div>
        </Station>

        {/* ── Travel ───────────────────────────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-sm">
            <Kicker>1998 – 1999</Kicker>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Venus, Venus, Earth.</h2>
            <p className="mt-4 text-base leading-relaxed text-star/70">
              Three flybys in sixteen months, each one bending the path and adding speed.
            </p>
          </div>
        </section>

        {/* ── Station: Jupiter ─────────────────────────────────── */}
        <Station stage={stage} id="flyby" className="px-6 md:px-14">
          <div className="max-w-md">
            <Kicker>30 December 2000 · Jupiter</Kicker>
            <Swap first="One last push, from Jupiter." second="Ten million kilometres away." />
            <p data-beat="0.7" className="mt-6 max-w-sm text-base leading-relaxed text-star/70">
              Even at that distance the giant planet’s gravity was enough to turn Cassini toward Saturn.
            </p>
          </div>
        </Station>

        {/* ── Travel ───────────────────────────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-sm">
            <Kicker>2001 – 2004</Kicker>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Three and a half more years.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-star/70">
              Across the emptiest part of the trip, with Saturn growing slowly ahead.
            </p>
          </div>
        </section>

        {/* ── Station: Saturn ──────────────────────────────────── */}
        <Station stage={stage} id="arrival" className="px-6 md:px-14">
          <div className="max-w-md">
            <Kicker>1 July 2004 · Saturn</Kicker>
            <Swap first="A ninety-six-minute burn." second="Then, finally, orbit." />
            <p data-beat="0.7" className="mt-6 max-w-sm text-base leading-relaxed text-star/70">
              The main engine slowed Cassini by 622 metres a second — just enough for Saturn to keep it.
            </p>
          </div>
        </Station>

        {/* ── End ──────────────────────────────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-xl">
            <Kicker>Cassini–Huygens</Kicker>
            <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">
              Then thirteen years at Saturn.
            </h2>
            <dl className="mt-8 grid max-w-md grid-cols-2 gap-x-10 gap-y-5 border-t border-white/15 pt-6">
              {[
                ["Launch mass", "5,712 kg"],
                ["Cruise", "1997 – 2004"],
                ["Gravity assists", "Venus ×2 · Earth · Jupiter"],
                ["Power", "3 RTGs · ~885 W"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-star/45">{k}</dt>
                  <dd className="mt-1 text-lg">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-10 max-w-md font-mono text-[11px] leading-relaxed text-star/40">
              A sample site built with 3drossa; not affiliated with or endorsed by NASA. Cassini model and
              Jupiter map: NASA 3D Resources. Earth maps: Solar System Scope, CC BY 4.0. Saturn, Venus and the
              Moon are painted. Sizes and distances are not to scale.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
