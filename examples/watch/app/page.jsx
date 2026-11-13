"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Stage, Station, Subject, createStage } from "3drossa/react";
import journeyDocument from "./journey.json";
import Watch from "./Watch.jsx";
import { DropBadge, DropCue, DroppedOr, useModelDrop } from "./ModelDrop.jsx";

const JourneyEditor = dynamic(() => import("3drossa/editor").then((m) => m.JourneyEditor), { ssr: false });

const DEV = process.env.NODE_ENV !== "production";
const SAVE_ENDPOINT = DEV ? "/api/rossa" : null;

/**
 * Put the product in the right-hand part of the frame, not the middle.
 *
 * The orbit circles the watch, so the lens always looks straight at it — which
 * would park it under the copy. Shifting the projection rather than the scene
 * keeps every orbit row in journey.json meaning what it says ("90° is the
 * crown side") while the picture sits beside the text. On a narrow screen the
 * copy is underneath instead, so the shift is upward.
 */
function FrameRight() {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);

  useLayoutEffect(() => {
    const wide = width >= 900;
    const dx = wide ? -width * 0.21 : 0;
    const dy = wide ? 0 : height * 0.14;
    camera.setViewOffset(width, height, dx, dy, width, height);
    // A portrait screen is narrow, and the orbit's distances were written for
    // a wide one: stand back a little rather than crop the watch to its dial.
    camera.zoom = wide ? 1 : 0.68;
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
      camera.zoom = 1;
    };
  }, [camera, width, height]);

  return null;
}

/** Studio light, built in the scene: no HDR file to download. */
function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={["#d9d2c6"]} />
      <Lightformer form="rect" intensity={3} position={[0, 4, 3]} scale={[8, 2, 1]} />
      <Lightformer
        form="rect"
        intensity={2}
        position={[-5, 1, 1]}
        rotation-y={Math.PI / 2}
        scale={[6, 3, 1]}
      />
      <Lightformer
        form="rect"
        intensity={1.5}
        position={[5, -1, -2]}
        rotation-y={-Math.PI / 2}
        scale={[6, 3, 1]}
      />
      <Lightformer form="ring" color="#ffd9b0" intensity={2} position={[2, 3, -5]} scale={3} />
      <Lightformer
        form="rect"
        intensity={1}
        position={[0, -4, 0]}
        rotation-x={-Math.PI / 2}
        scale={[8, 8, 1]}
      />
    </Environment>
  );
}

function Kicker({ children }) {
  return <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.28em] text-moss/70">{children}</p>;
}

export default function Page() {
  const stage = useMemo(() => createStage(journeyDocument), []);
  const [editing, setEditing] = useState(false);
  const { model, notice, over, reset } = useModelDrop({ editorWrites: editing && !!SAVE_ENDPOINT });

  return (
    <>
      <div className="fixed inset-0 -z-10">
        <Canvas camera={{ position: [0, 0, 7], fov: 30 }} dpr={[1, 2]} gl={{ antialias: true }}>
          <color attach="background" args={["#ece6dc"]} />
          <fog attach="fog" args={["#ece6dc", 9, 20]} />
          <FrameRight />
          <Studio />
          <ambientLight intensity={0.35} />
          <directionalLight position={[3, 5, 6]} intensity={1.6} color="#fff4e6" />
          <directionalLight position={[-4, -2, -5]} intensity={0.6} color="#b9d4ff" />

          <Stage stage={stage}>
            <Subject stage={stage}>
              <DroppedOr url={model?.url}>
                <Watch />
              </DroppedOr>
            </Subject>
            {editing ? (
              <JourneyEditor stage={stage} endpoint={SAVE_ENDPOINT} autosave="3drossa:watch" />
            ) : null}
          </Stage>
        </Canvas>
      </div>

      <header className="fixed inset-x-0 top-0 z-[2147483003] flex items-center justify-between px-6 py-5 md:px-10">
        <div className="display text-xl font-semibold tracking-[0.18em]">HALDEN</div>
        <nav className="hidden gap-8 text-sm text-ink/60 lg:flex">
          <span className="text-ink">Field</span>
          <span>Dive</span>
          <span>Journal</span>
          <span>Service</span>
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">
            <DropBadge
              model={model}
              notice={notice}
              reset={reset}
              idle="drop a .glb to see your product here"
              tone="light"
            />
          </span>
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-full border border-ink/20 bg-white/60 px-4 py-1.5 text-xs font-medium backdrop-blur hover:bg-white"
          >
            {editing ? "Close editor" : "Edit shot"}
          </button>
        </div>
      </header>

      <DropCue over={over} label="Drop a .glb to put it on this page" />

      <main id="page" className="relative">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="flex h-svh items-end px-6 pb-14 md:items-center md:px-16 md:pb-0">
          <div className="panel max-w-[30rem]">
            <Kicker>Field Automatic · 38 mm</Kicker>
            <h1 className="display text-5xl font-medium leading-[0.98] md:text-7xl">
              Made to be read at a glance.
            </h1>
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink/70">
              Brushed steel, a dial you can read in the dark, and a movement you can watch through the back.
              Scroll to walk around it.
            </p>
            <div className="mt-8 flex items-center gap-4 text-sm">
              <span className="rounded-full bg-moss px-5 py-2.5 font-medium text-bone">From $640</span>
              <span className="text-ink/50">↓ scroll</span>
            </div>
          </div>
        </section>

        {/* ── Station: the dial ────────────────────────────────── */}
        <Station stage={stage} id="dial" className="px-6 md:px-16">
          <div className="panel max-w-[28rem] self-end pb-6 md:self-center md:pb-0">
            <Kicker>The dial</Kicker>
            <div className="grid">
              <h2
                data-beat="0.04"
                data-beat-out="0.34"
                className="display col-start-1 row-start-1 text-4xl font-medium leading-tight md:text-6xl"
              >
                Nothing on it you don’t need.
              </h2>
              <p
                data-beat="0.48"
                className="display col-start-1 row-start-1 text-4xl font-medium leading-tight md:text-6xl"
              >
                Twelve markers. Three hands.
              </p>
            </div>
            <p data-beat="0.68" className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink/70">
              Applied indices filled with luminous paint, under a domed sapphire crystal coated on the inside
              so it never throws glare back at you.
            </p>
          </div>
        </Station>

        {/* ── Travel ───────────────────────────────────────────── */}
        <section className="flex h-svh items-end px-6 pb-14 md:items-center md:px-16 md:pb-0">
          <div className="panel max-w-[26rem]">
            <Kicker>The case</Kicker>
            <h2 className="display text-4xl font-medium leading-tight md:text-5xl">
              Brushed, then polished where light lands.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink/70">
              A 316L case, 11 mm thin, with a bezel polished by hand so the edge catches light while the
              flanks stay quiet.
            </p>
          </div>
        </section>

        {/* ── Station: the crown ───────────────────────────────── */}
        <Station stage={stage} id="crown" className="px-6 md:px-16">
          <div className="panel max-w-[28rem] self-end pb-6 md:self-center md:pb-0">
            <Kicker>The crown</Kicker>
            <div className="grid">
              <h2
                data-beat="0.04"
                data-beat-out="0.34"
                className="display col-start-1 row-start-1 text-4xl font-medium leading-tight md:text-6xl"
              >
                Screwed down.
              </h2>
              <p
                data-beat="0.48"
                className="display col-start-1 row-start-1 text-4xl font-medium leading-tight md:text-6xl"
              >
                Two hundred metres.
              </p>
            </div>
            <p data-beat="0.7" className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink/70">
              The crown threads into the case against a double gasket. Knurled deep enough to grip with wet
              fingers, small enough not to dig into your wrist.
            </p>
          </div>
        </Station>

        {/* ── Travel ───────────────────────────────────────────── */}
        <section className="flex h-svh items-end px-6 pb-14 md:items-center md:px-16 md:pb-0">
          <div className="panel max-w-[26rem]">
            <Kicker>Turn it over</Kicker>
            <h2 className="display text-4xl font-medium leading-tight md:text-5xl">
              Most watches hide this part.
            </h2>
          </div>
        </section>

        {/* ── Station: the movement ────────────────────────────── */}
        <Station stage={stage} id="movement" className="px-6 md:px-16">
          <div className="panel max-w-[28rem] self-end pb-6 md:self-center md:pb-0">
            <Kicker>Calibre H-21</Kicker>
            <div className="grid">
              <h2
                data-beat="0.04"
                data-beat-out="0.34"
                className="display col-start-1 row-start-1 text-4xl font-medium leading-tight md:text-6xl"
              >
                Wound by your wrist.
              </h2>
              <p
                data-beat="0.48"
                className="display col-start-1 row-start-1 text-4xl font-medium leading-tight md:text-6xl"
              >
                42 hours in reserve.
              </p>
            </div>
            <p data-beat="0.7" className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink/70">
              Twenty-one jewels and a gold-toned rotor that swings as you move, seen through a sapphire
              caseback.
            </p>
          </div>
        </Station>

        {/* ── Order ────────────────────────────────────────────── */}
        <section className="flex h-svh items-end px-6 pb-12 md:items-center md:px-16 md:pb-0">
          <div className="panel max-w-[30rem]">
            <Kicker>Halden Field Automatic</Kicker>
            <h2 className="display text-5xl font-medium leading-[1] md:text-6xl">Yours from $640.</h2>
            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-ink/15 pt-6 text-sm">
              {[
                ["Case", "38 mm · 316L steel"],
                ["Water", "200 m"],
                ["Movement", "H-21 automatic"],
                ["Reserve", "42 hours"],
                ["Crystal", "Sapphire, AR inside"],
                ["Strap", "Vegetable-tanned leather"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-[0.2em] text-ink/45">{k}</dt>
                  <dd className="mt-1">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#page" className="rounded-full bg-moss px-6 py-3 text-sm font-medium text-bone">
                Reserve yours
              </a>
              <a href="#page" className="rounded-full border border-ink/20 px-6 py-3 text-sm">
                Find a stockist
              </a>
            </div>
            <p className="mt-8 text-xs text-ink/45">
              A sample site built with 3drossa. Halden is a fictional brand.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
