"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas } from "@react-three/fiber";
import { Stage, Station, Subject, createStage } from "3drossa/react";
import journeyDocument from "./journey.json";
import Probe from "./Probe.jsx";
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
              <DroppedOr url={model?.url} size={1.4}>
                <Probe stage={stage} />
              </DroppedOr>
            </Subject>
            {editing ? (
              <JourneyEditor stage={stage} endpoint={SAVE_ENDPOINT} autosave="3drossa:voyage" />
            ) : null}
          </Stage>
        </Canvas>
      </div>

      <header className="fixed inset-x-0 top-0 z-[2147483003] flex items-center justify-between bg-gradient-to-b from-void via-void/70 to-transparent px-6 pb-8 pt-5 md:px-10">
        <div className="font-mono text-sm tracking-[0.4em]">LANTERN</div>
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
            <Kicker>Mission Lantern</Kicker>
            <h1 className="text-5xl font-semibold leading-[1] tracking-tight md:text-8xl">
              Seven years to Saturn.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-star/70">
              Scroll to fly it. The probe, the camera and every planet you pass are keyframes in one document,
              bound to how far down the page you are.
            </p>
          </div>
        </section>

        {/* ── Station: launch ──────────────────────────────────── */}
        <Station stage={stage} id="launch" className="px-6 md:px-14">
          <div className="max-w-md">
            <Kicker>T + 00:09:12</Kicker>
            <Swap
              first="Leaving home at eleven kilometres a second."
              second="In a week, Earth is a point of light."
            />
            <p data-beat="0.7" className="mt-6 max-w-sm text-base leading-relaxed text-star/70">
              The upper stage burns for nine minutes and falls away. Everything after this is coasting, and a
              few corrections.
            </p>
          </div>
        </Station>

        {/* ── Travel ───────────────────────────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-sm">
            <Kicker>Year 1</Kicker>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Then nothing, for a long time.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-star/70">
              Mars goes by at a distance. Most of a voyage is waiting.
            </p>
          </div>
        </section>

        {/* ── Station: Jupiter ─────────────────────────────────── */}
        <Station stage={stage} id="flyby" className="px-6 md:px-14">
          <div className="max-w-md">
            <Kicker>Year 2 · Jupiter</Kicker>
            <Swap first="Borrowing speed from Jupiter." second="Four kilometres a second, for free." />
            <p data-beat="0.7" className="mt-6 max-w-sm text-base leading-relaxed text-star/70">
              Swinging close behind the planet steals a little of its orbital speed. Jupiter never notices the
              difference.
            </p>
          </div>
        </Station>

        {/* ── Travel ───────────────────────────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-sm">
            <Kicker>Years 3 – 6</Kicker>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Five more years.</h2>
            <p className="mt-4 text-base leading-relaxed text-star/70">
              The probe sleeps through most of it, waking once a week to say it is still there.
            </p>
          </div>
        </section>

        {/* ── Station: Saturn ──────────────────────────────────── */}
        <Station stage={stage} id="arrival" className="px-6 md:px-14">
          <div className="max-w-md">
            <Kicker>Year 7 · Saturn</Kicker>
            <Swap first="Ninety-six minutes of burn." second="Then, finally, orbit." />
            <p data-beat="0.7" className="mt-6 max-w-sm text-base leading-relaxed text-star/70">
              The engine fires against the direction of travel, through the gap between the rings, and the
              planet lets it stay.
            </p>
          </div>
        </Station>

        {/* ── End ──────────────────────────────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-xl">
            <Kicker>Mission summary</Kicker>
            <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">1.4 billion kilometres.</h2>
            <dl className="mt-8 grid max-w-md grid-cols-2 gap-x-10 gap-y-5 border-t border-white/15 pt-6">
              {[
                ["Launch mass", "2,150 kg"],
                ["Time in flight", "7 years"],
                ["Gravity assists", "1 · Jupiter"],
                ["Power", "3 RTGs · 880 W"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-star/45">{k}</dt>
                  <dd className="mt-1 text-lg">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-10 font-mono text-[11px] text-star/40">
              A sample site built with 3drossa. Lantern is a fictional mission.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
