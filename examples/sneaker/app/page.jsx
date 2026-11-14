"use client";

import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { Stage, Station, Subject, createStage } from "3drossa/react";
import journeyDocument from "./journey.json";
import Shoe, { COLOURWAYS } from "./Shoe.jsx";
import { DropBadge, DropCue, DroppedOr, useModelDrop } from "./ModelDrop.jsx";

const JourneyEditor = dynamic(() => import("3drossa/editor").then((m) => m.JourneyEditor), { ssr: false });

const DEV = process.env.NODE_ENV !== "production";
const SAVE_ENDPOINT = DEV ? "/api/rossa" : null;

/**
 * Put the product in the right-hand part of the frame, not the middle.
 *
 * The orbit circles the shoe, so the lens always looks straight at it — which
 * would park it under the copy. Shifting the projection rather than the scene
 * keeps every orbit row in journey.json meaning what it says ("90° is the
 * toe") while the picture sits beside the text. On a narrow screen the
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
    // a wide one: stand back a little rather than crop the shoe to its laces.
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

/**
 * Inside the colourways station, scroll picks the colourway.
 *
 * Read from the stage every frame, but only pushed into React when the answer
 * changes — three times across the station, not sixty times a second. Outside
 * the station the last choice stands, so a swatch clicked on the way down is
 * still the shoe you see at the bottom.
 */
function ColourwayFromScroll({ stage, onChange }) {
  const last = useRef(null);
  useFrame(() => {
    if (stage.state.station !== "colourways") {
      last.current = null;
      return;
    }
    const t = stage.state.stationT;
    const index = t < 0.33 ? 0 : t < 0.64 ? 1 : 2;
    if (index !== last.current) {
      last.current = index;
      onChange(COLOURWAYS[index].id);
    }
  });
  return null;
}

function Kicker({ children }) {
  return <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-ink/55">{children}</p>;
}

function Swatches({ value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      {COLOURWAYS.map((c) => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          aria-pressed={value === c.id}
          aria-label={c.label}
          title={c.label}
          className={`h-8 w-8 rounded-full border-2 transition ${
            value === c.id ? "border-ink scale-110" : "border-white/80 hover:scale-105"
          }`}
          style={{ background: c.swatch }}
        />
      ))}
      <span className="ml-1 text-sm text-ink/60">{COLOURWAYS.find((c) => c.id === value)?.label}</span>
    </div>
  );
}

export default function Page() {
  const stage = useMemo(() => createStage(journeyDocument), []);
  const [editing, setEditing] = useState(false);
  const [colourway, setColourway] = useState("midnight");
  const { model, notice, over, reset } = useModelDrop({ editorWrites: editing && !!SAVE_ENDPOINT });

  return (
    <>
      <div className="fixed inset-0 -z-10">
        <Canvas camera={{ position: [0, 0, 7], fov: 30 }} dpr={[1, 2]} gl={{ antialias: true }}>
          <color attach="background" args={["#ebe9e4"]} />
          <fog attach="fog" args={["#ebe9e4", 10, 22]} />
          <FrameRight />
          <Studio />
          <ambientLight intensity={0.4} />
          <directionalLight position={[3, 5, 6]} intensity={1.4} color="#fff6ec" />
          <directionalLight position={[-4, -2, -5]} intensity={0.5} color="#c9dcff" />
          <ContactShadows position={[0, -0.86, 0]} opacity={0.45} scale={8} blur={2.6} far={2} />

          <Stage stage={stage}>
            <ColourwayFromScroll stage={stage} onChange={setColourway} />
            <Subject stage={stage}>
              <Suspense fallback={null}>
                <DroppedOr url={model?.url} size={3.2}>
                  <Shoe colourway={colourway} />
                </DroppedOr>
              </Suspense>
            </Subject>
            {editing ? (
              <JourneyEditor stage={stage} endpoint={SAVE_ENDPOINT} autosave="3drossa:sneaker" />
            ) : null}
          </Stage>
        </Canvas>
      </div>

      <header className="fixed inset-x-0 top-0 z-[2147483003] flex items-center justify-between px-6 py-5 md:px-10">
        <div className="display text-xl tracking-[0.12em]">KESTREL</div>
        <nav className="hidden gap-8 text-sm text-ink/60 lg:flex">
          <span className="text-ink">Run</span>
          <span>Trail</span>
          <span>Walk</span>
          <span>Journal</span>
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
            <Kicker>Kestrel Daily · Running</Kicker>
            <h1 className="display text-5xl leading-[0.98] md:text-7xl">Light enough to forget.</h1>
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink/70">
              An engineered-mesh trainer for everyday miles. Scroll to walk around it.
            </p>
            <div className="mt-8 flex items-center gap-4 text-sm">
              <span className="rounded-full bg-ink px-5 py-2.5 font-medium text-bone">$128</span>
              <span className="text-ink/50">↓ scroll</span>
            </div>
          </div>
        </section>

        {/* ── Station: the upper ───────────────────────────────── */}
        <Station stage={stage} id="upper" className="px-6 md:px-16">
          <div className="panel max-w-[28rem] self-end pb-6 md:self-center md:pb-0">
            <Kicker>The upper</Kicker>
            <div className="grid">
              <h2
                data-beat="0.04"
                data-beat-out="0.34"
                className="display col-start-1 row-start-1 text-4xl leading-tight md:text-6xl"
              >
                One piece of knit.
              </h2>
              <p
                data-beat="0.48"
                className="display col-start-1 row-start-1 text-4xl leading-tight md:text-6xl"
              >
                Open where your foot runs hot.
              </p>
            </div>
            <p data-beat="0.68" className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink/70">
              Engineered mesh, tighter at the heel and toe for structure and open across the forefoot for air.
              No seams to rub.
            </p>
          </div>
        </Station>

        {/* ── Travel ───────────────────────────────────────────── */}
        <section className="flex h-svh items-end px-6 pb-14 md:items-center md:px-16 md:pb-0">
          <div className="panel max-w-[26rem]">
            <Kicker>The fit</Kicker>
            <h2 className="display text-4xl leading-tight md:text-5xl">Held at the heel, free at the toe.</h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink/70">
              Reinforced eyelets and a padded collar lock the heel in place without pressing on it.
            </p>
          </div>
        </section>

        {/* ── Station: the sole ────────────────────────────────── */}
        <Station stage={stage} id="sole" className="px-6 md:px-16">
          <div className="panel max-w-[28rem] self-end pb-6 md:self-center md:pb-0">
            <Kicker>The midsole</Kicker>
            <div className="grid">
              <h2
                data-beat="0.04"
                data-beat-out="0.34"
                className="display col-start-1 row-start-1 text-4xl leading-tight md:text-6xl"
              >
                Foam, heel to toe.
              </h2>
              <p
                data-beat="0.48"
                className="display col-start-1 row-start-1 text-4xl leading-tight md:text-6xl"
              >
                Soft landing. Quick push-off.
              </p>
            </div>
            <p data-beat="0.68" className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink/70">
              One full-length slab, thickest under the heel where you land and tapering to a firm, springy
              toe.
            </p>
          </div>
        </Station>

        {/* ── Station: colourways ──────────────────────────────── */}
        <Station stage={stage} id="colourways" className="px-6 md:px-16">
          <div className="panel max-w-[28rem] self-end pb-6 md:self-center md:pb-0">
            <Kicker>Three colourways</Kicker>
            <div className="grid">
              <h2
                data-beat="0.02"
                data-beat-out="0.27"
                className="display col-start-1 row-start-1 text-5xl leading-tight md:text-7xl"
              >
                Midnight.
              </h2>
              <p
                data-beat="0.35"
                data-beat-out="0.58"
                className="display col-start-1 row-start-1 text-5xl leading-tight md:text-7xl"
              >
                Beach.
              </p>
              <p
                data-beat="0.66"
                className="display col-start-1 row-start-1 text-5xl leading-tight md:text-7xl"
              >
                Street.
              </p>
            </div>
            <div className="mt-8">
              <Swatches value={colourway} onChange={setColourway} />
            </div>
          </div>
        </Station>

        {/* ── Order ────────────────────────────────────────────── */}
        <section className="flex h-svh items-end px-6 pb-12 md:items-center md:px-16 md:pb-0">
          <div className="panel max-w-[30rem]">
            <Kicker>Kestrel Daily</Kicker>
            <h2 className="display text-5xl leading-[1] md:text-6xl">Yours for $128.</h2>
            <div className="mt-6">
              <Swatches value={colourway} onChange={setColourway} />
            </div>
            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-ink/15 pt-6 text-sm">
              {[
                ["Weight", "248 g (US 9)"],
                ["Drop", "8 mm"],
                ["Upper", "Engineered mesh"],
                ["Midsole", "Full-length foam"],
                ["Sizes", "US 6 – 14"],
                ["Use", "Road, daily miles"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-[0.2em] text-ink/45">{k}</dt>
                  <dd className="mt-1">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#page" className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone">
                Add to bag
              </a>
              <a href="#page" className="rounded-full border border-ink/20 px-6 py-3 text-sm">
                Find your size
              </a>
            </div>
            <p className="mt-8 text-xs leading-relaxed text-ink/45">
              A sample site built with 3drossa. Kestrel is a fictional brand. Shoe model “Materials Variants
              Shoe” © 2021 Shopify,{" "}
              <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">
                CC BY 4.0
              </a>
              , from the{" "}
              <a
                className="underline"
                href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/MaterialsVariantsShoe"
              >
                Khronos glTF Sample Assets
              </a>
              .
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
