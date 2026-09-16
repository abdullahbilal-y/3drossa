"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas } from "@react-three/fiber";
import { Stage, Station, Subject, createStage } from "3drossa/react";
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
 * The editor ships with the demo — this page is the playground.
 *
 * In a real site it belongs behind a dev flag, because it pulls drei controls
 * and writes source files. Here the whole point is that a visitor can open it,
 * drag the path over the copy and see what the tool is. With no server to POST
 * to, Save downloads the document instead of writing it.
 */
const SAVE_ENDPOINT = DEV ? "/api/rossa" : null;

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
  const [model, setModel] = useState(null);
  const [over, setOver] = useState(false);

  /**
   * Drop a .glb on the page and it flies the path instead of the plane.
   *
   * On the window rather than on a drop zone: the whole page IS the scene, and
   * a target you have to find first turns "does this move my model?" into a
   * scavenger hunt. The file is read locally into an object URL — nothing is
   * uploaded anywhere, and there is no server here to upload it to.
   */
  useEffect(() => {
    const isModel = (name) => /\.(glb|gltf)$/i.test(name);

    const onOver = (event) => {
      event.preventDefault();
      setOver(true);
    };
    const onLeave = (event) => {
      if (event.relatedTarget === null) setOver(false);
    };
    const onDrop = (event) => {
      event.preventDefault();
      setOver(false);

      /**
       * The editor claims the drop when it can write the file to disk.
       *
       * With a save route, a dropped model goes into the repository and the
       * document records it — which is the real thing. This object-URL path is
       * the fallback for the static playground, where there is no server to
       * write to and a preview that lasts the session is the best on offer.
       */
      if (event.defaultPrevented) return;

      const file = [...(event.dataTransfer?.files || [])].find((f) => isModel(f.name));
      if (!file) return;

      setModel((previous) => {
        // Object URLs are held until revoked; without this every model you
        // tried stays in memory for the session.
        if (previous) URL.revokeObjectURL(previous.url);
        return { url: URL.createObjectURL(file), name: file.name };
      });
    };

    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <>
      <div className="fixed inset-0 -z-10">
        <Canvas camera={{ position: [0, 0, 6], fov: 38 }} dpr={[1, 2]}>
          <color attach="background" args={["#0e1418"]} />
          <fog attach="fog" args={["#0e1418", 6, 26]} />

          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 6, 5]} intensity={1.8} color="#ffe9c9" />
          <directionalLight position={[-5, -2, -4]} intensity={0.5} color="#5fa8c7" />

          <Stage stage={stage}>
            {/*
              The document names the model; this falls back to the built-in
              paper plane when it does not, and to the dropped preview on the
              static playground.
            */}
            <Subject stage={stage}>
              <Plane url={model?.url} />
            </Subject>
            {editing ? (
              /*
                autosave keeps your edits in this browser as you make them.
                There is no server here to save to, so without it a reload —
                or a stray refresh mid-drag — costs you everything you authored.
              */
              <JourneyEditor
                stage={stage}
                endpoint={SAVE_ENDPOINT}
                autosave="3drossa:playground"
              />
            ) : null}
          </Stage>
        </Canvas>
      </div>

      <div className="fixed right-4 top-4 z-[2147483003] flex items-center gap-2">
        <span className="rounded border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white/60 backdrop-blur">
          {model ? (
            <>
              {model.name}
              <button
                onClick={() => {
                  URL.revokeObjectURL(model.url);
                  setModel(null);
                }}
                className="ml-2 text-white/80 underline"
              >
                reset
              </button>
            </>
          ) : (
            "drop a .glb to fly your own model"
          )}
        </span>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded border border-white/25 bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur"
        >
          {editing ? "Close editor" : "Edit path"}
        </button>
      </div>

      {over ? (
        <div className="pointer-events-none fixed inset-4 z-[2147483003] flex items-center justify-center rounded-xl border-2 border-dashed border-white/40 bg-black/40 text-sm text-white backdrop-blur-sm">
          Drop a .glb or .gltf to fly it
        </div>
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
