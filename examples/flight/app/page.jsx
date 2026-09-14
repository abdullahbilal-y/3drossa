"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas } from "@react-three/fiber";
import { Stage, Station, createStage } from "3drossa/react";
import journeyDocument from "./journey.json";
import Plane from "./Plane.jsx";

// The editor is dev-only and pulls drei; keeping it behind a dynamic import
// means it never reaches a production bundle.
const JourneyEditor = dynamic(
  () => import("3drossa/editor").then((m) => m.JourneyEditor),
  { ssr: false }
);

const DEV = process.env.NODE_ENV !== "production";

/**
 * The demo host.
 *
 * Deliberately ordinary: a hero, two stations, some copy, a sign-off. The
 * engine's claim is that this much structure is enough to make a page read as a
 * place, and that the whole journey is one editable document rather than a
 * pile of tuned constants.
 */
export default function Page() {
  // One stage for the page. Created once — rebuilding it would rebuild the
  // spline, and the spline is the thing everything else is measured against.
  const stage = useMemo(() => createStage(journeyDocument), []);
  const [editing, setEditing] = useState(false);

  return (
    <>
      <div className="fixed inset-0 -z-10">
        <Canvas camera={{ position: [0, 0, 6], fov: 38 }} dpr={[1, 2]}>
          <color attach="background" args={["#0e1418"]} />
          <fog attach="fog" args={["#0e1418", 6, 26]} />

          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 6, 5]} intensity={1.8} color="#ffe9c9" />
          <directionalLight position={[-5, -2, -4]} intensity={0.5} color="#5fa8c7" />

          <Stage stage={stage} parallax={0.2}>
            <Plane stage={stage} />
            {DEV && editing ? <JourneyEditor stage={stage} /> : null}
          </Stage>
        </Canvas>
      </div>

      {DEV ? (
        <button
          onClick={() => setEditing((v) => !v)}
          className="fixed right-4 top-4 z-50 rounded border border-white/20 bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur"
        >
          {editing ? "Close editor" : "Edit path"}
        </button>
      ) : null}

      <main id="page" className="relative">
        <section className="flex h-svh items-center px-8">
          <div className="max-w-xl">
            <p className="mb-4 text-xs uppercase tracking-[0.3em] opacity-50">
              3drossa
            </p>
            <h1 className="text-5xl font-semibold leading-[1.05] md:text-7xl">
              A page you move through.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed opacity-70">
              Scroll. The path, the camera and the copy are one document — and
              you drag it, rather than type it.
            </p>
          </div>
        </section>

        <Station stage={stage} id="launch" className="px-8">
          <div className="mx-auto w-full max-w-5xl">
            <div className="max-w-md">
              <h2 data-beat="0.05" data-beat-out="0.42" className="text-4xl font-semibold md:text-5xl">
                A station pins the page.
              </h2>
              <p data-beat="0.5" className="text-4xl font-semibold md:text-5xl">
                Three statements, one frame.
              </p>
              <p data-beat="0.72" className="mt-6 max-w-sm text-base leading-relaxed opacity-70">
                Because each one leaves before the next arrives, this section
                carries what would otherwise need three screens of height.
              </p>
            </div>
          </div>
        </Station>

        <section className="flex h-svh items-center px-8">
          <div className="ml-auto max-w-sm text-right">
            <h2 className="text-3xl font-semibold">Then it lets go.</h2>
            <p className="mt-4 text-base leading-relaxed opacity-70">
              Between stations the pin releases and the subject travels. Little
              copy here — the world is the point.
            </p>
          </div>
        </section>

        <Station stage={stage} id="arrival" className="px-8">
          <div className="mx-auto w-full max-w-5xl">
            <div className="max-w-md">
              <h2 data-beat="0.1" data-beat-out="0.5" className="text-4xl font-semibold md:text-5xl">
                The approach.
              </h2>
              <p data-beat="0.58" className="text-4xl font-semibold md:text-5xl">
                It arrives when the page asks it to.
              </p>
              <p data-beat="0.78" className="mt-6 max-w-sm text-base leading-relaxed opacity-70">
                The waypoint is bound to this station, not to a guess at how
                tall the sections above happen to be.
              </p>
            </div>
          </div>
        </Station>

        <section className="flex h-svh items-center justify-center px-8 text-center">
          <div>
            <h2 className="text-3xl font-semibold">And out.</h2>
            <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed opacity-70">
              Press <span className="opacity-100">Edit path</span> to drag any of
              it, against this page, and save it back to disk.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
