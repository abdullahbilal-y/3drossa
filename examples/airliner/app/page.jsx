"use client";

import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas } from "@react-three/fiber";
import { Stage, Station, Subject, createStage } from "3drossa/react";
import journeyDocument from "./journey.json";
import Airliner from "./Airliner.jsx";
import SkyScene from "./SkyScene.jsx";
import { DropBadge, DropCue, DroppedOr, useModelDrop } from "./ModelDrop.jsx";

const JourneyEditor = dynamic(() => import("3drossa/editor").then((m) => m.JourneyEditor), { ssr: false });

const DEV = process.env.NODE_ENV !== "production";
const SAVE_ENDPOINT = DEV ? "/api/rossa" : null;

function Kicker({ children }) {
  return <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-navy/60">{children}</p>;
}

/**
 * A section's two headlines.
 *
 * Inside a station they share one cell and the second replaces the first on
 * its beat. When the document has no station by that id the section renders
 * unpinned and nothing stages the beats, so overlaying them would print both
 * lines on top of each other — stack them instead.
 */
function Swap({ stage, station, first, second }) {
  const pinned = !!stage.journey.stations.get(station);
  const cls = "text-4xl font-semibold leading-[1.02] tracking-tight md:text-6xl";
  if (!pinned) {
    return (
      <div>
        <h2 className={cls}>{first}</h2>
        <p className={`${cls} mt-2`}>{second}</p>
      </div>
    );
  }
  const overlay = `col-start-1 row-start-1 ${cls}`;
  return (
    <div className="grid">
      <h2 data-beat="0.04" data-beat-out="0.34" className={overlay}>
        {first}
      </h2>
      <p data-beat="0.48" className={overlay}>
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
        <Canvas camera={{ position: [0, 0, 6], fov: 40, far: 5000 }} dpr={[1, 2]}>
          <SkyScene />
          <Stage stage={stage}>
            <Subject stage={stage}>
              <Suspense fallback={null}>
                <DroppedOr url={model?.url} size={2.6}>
                  <Airliner />
                </DroppedOr>
              </Suspense>
            </Subject>
            {editing ? (
              <JourneyEditor stage={stage} endpoint={SAVE_ENDPOINT} autosave="3drossa:airliner" />
            ) : null}
          </Stage>
        </Canvas>
      </div>

      <header className="fixed inset-x-0 top-0 z-[2147483003] flex items-center justify-between px-6 py-5 md:px-10">
        <div className="text-lg font-bold tracking-[0.28em]">NORTHLINE</div>
        <nav className="hidden gap-8 text-sm text-navy/60 lg:flex">
          <span className="text-navy">Fleet</span>
          <span>Destinations</span>
          <span>Upper deck</span>
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">
            <DropBadge
              model={model}
              notice={notice}
              reset={reset}
              idle="drop a .glb to fly your own aircraft"
              tone="light"
            />
          </span>
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-full border border-navy/20 bg-white/60 px-4 py-1.5 text-xs font-medium backdrop-blur hover:bg-white"
          >
            {editing ? "Close editor" : "Edit path"}
          </button>
        </div>
      </header>

      <DropCue over={over} label="Drop a .glb to fly it past the camera" />

      <main id="page" className="legible relative">
        {/* ── Hero: a speck on the horizon ─────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-xl">
            <Kicker>Northline · The double-deck flagship</Kicker>
            <h1 className="text-5xl font-bold leading-[0.98] tracking-tight md:text-8xl">
              The biggest thing in the sky.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-navy/70">
              Keep scrolling. It’s coming to you.
            </p>
          </div>
        </section>

        {/* ── Travel: inbound ──────────────────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-sm">
            <Kicker>Inbound</Kicker>
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
              A speck on the horizon, then a wall of aircraft.
            </h2>
          </div>
        </section>

        {/* ── Station: right past the lens ─────────────────────── */}
        <Station stage={stage} id="close" className="px-6 md:px-14">
          <div className="max-w-md">
            <Kicker>Up close</Kicker>
            <Swap
              stage={stage}
              station="close"
              first="Eighty metres, wingtip to wingtip."
              second="Two full decks, nose to tail."
            />
            <p data-beat="0.7" className="mt-6 max-w-sm text-base leading-relaxed text-navy/75">
              At 575 tonnes on take-off it is the largest passenger airliner ever built — lifted by four
              engines.
            </p>
          </div>
        </Station>

        {/* ── Travel: the climb ────────────────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-sm">
            <Kicker>Departure</Kicker>
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Then up, and away.</h2>
            <p className="mt-4 text-base leading-relaxed text-navy/70">Climbing out over the cloud deck.</p>
          </div>
        </section>

        {/* ── Station: cruise ──────────────────────────────────── */}
        <Station stage={stage} id="cruise" className="px-6 md:px-14">
          <div className="max-w-md">
            <Kicker>Range</Kicker>
            <Swap stage={stage} station="cruise" first="14,800 kilometres." second="Without stopping once." />
            <p data-beat="0.7" className="mt-6 max-w-sm text-base leading-relaxed text-navy/75">
              London to Singapore, with thousands of kilometres to spare.
            </p>
          </div>
        </Station>

        {/* ── End ──────────────────────────────────────────────── */}
        <section className="flex h-svh items-center px-6 md:px-14">
          <div className="max-w-xl">
            <Kicker>Northline flagship</Kicker>
            <h2 className="text-4xl font-bold tracking-tight md:text-6xl">Fly the upper deck.</h2>
            <dl className="mt-8 grid max-w-md grid-cols-2 gap-x-10 gap-y-5 border-t border-navy/15 pt-6">
              {[
                ["Wingspan", "79.75 m"],
                ["Length", "72.7 m"],
                ["Max take-off", "575 t"],
                ["Range", "14,800 km"],
                ["Certified for", "853 passengers"],
                ["Engines", "4"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.25em] text-navy/45">{k}</dt>
                  <dd className="mt-1 text-lg">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#page" className="rounded-full bg-navy px-6 py-3 text-sm font-medium text-white">
                Book a flight
              </a>
              <a href="#page" className="rounded-full border border-navy/25 bg-white/40 px-6 py-3 text-sm">
                See routes
              </a>
            </div>
            <p className="mt-10 max-w-md text-[11px] leading-relaxed text-navy/50">
              A sample site built with 3drossa. Northline is a fictional airline, not affiliated with Airbus.
              Figures are for the A380-800. Aircraft model: “A380 (no logo)” © 2026{" "}
              <a className="underline" href="https://github.com/amvlab/aircraft-models">
                amvlab
              </a>
              ,{" "}
              <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">
                CC BY 4.0
              </a>
              .
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
