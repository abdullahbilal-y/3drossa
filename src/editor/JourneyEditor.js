"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, TransformControls } from "@react-three/drei";
import { makeSample, serializeDocument } from "../core/index.js";
import Occlusion from "./Occlusion.js";
import Waypoints from "./Waypoints.js";
import Panel from "./Panel.js";

/**
 * The editor, running inside the host page.
 *
 * Everything it shows is the real thing: the real curve, the real station
 * framings, and the real copy measured from the live DOM. You are not authoring
 * against a diagram of the page, you are authoring against the page.
 */
export default function JourneyEditor({
  stage,
  endpoint = "/api/rossa",
  copySelector,
}) {
  const journey = stage.journey;
  const { gl, camera, controls } = useThree();

  /** The working document. Edits land here; Save writes it to disk. */
  const [doc, setDoc] = useState(() => structuredClone(journey.doc));
  const [selection, setSelection] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(null);
  /**
   * The PAGE camera by default, not a free one.
   *
   * Seeing the real page - the real copy, at the real size, framed the way the
   * reader will see it - is the entire reason this editor lives inside the host
   * rather than in a studio of its own. Taking the camera and pulling back to
   * fit the whole path throws that away: you get an abstract diagram in empty
   * space, which is precisely what a standalone editor would have given you.
   *
   * Free camera is still one click away, for when you need to inspect the
   * shape of the path rather than its relationship to the copy.
   */
  const [freeCamera, setFreeCamera] = useState(false);

  /**
   * A fixed host element of our own, for the panel to render into.
   *
   * drei's <Html> wrapper is `position: absolute` with a `transform` on it
   * (Html.js sets `transform: translate3d(...)` to place it at the projected 3D
   * point). Any transformed ancestor becomes the containing block for
   * `position: fixed` descendants — so a panel styled `fixed` inside it is not
   * fixed to the viewport at all, and on a scrolled page it ends up parked at
   * the top of the document where nobody will ever see it.
   *
   * Portalling into our own `position: fixed; inset: 0` element, with the 3D
   * projection neutered, makes the wrapper's origin the viewport's origin. It
   * also means the panel does not depend on how the host happened to stack its
   * canvas.
   */
  const overlay = useMemo(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.dataset.rossaOverlay = "";
    // Above the raised canvas chain, which now sits at 2147483000.
    el.style.cssText =
      "position:fixed;inset:0;z-index:2147483002;pointer-events:none;";
    return el;
  }, []);

  /**
   * The editor samples the journey ITSELF, and starts the stage if nobody has.
   *
   * It therefore needs no <Stage> and no <Station> mounted. That matters more
   * than it sounds: the sites that want a path editor are the ones that ALREADY
   * have a scroll-driven 3D page, driven by their own GSAP/Lenis/whatever. If
   * the editor only worked once you had adopted the whole engine, it would be
   * useless to exactly the people it is for.
   */
  const sample = useMemo(() => makeSample(), []);

  useEffect(() => {
    stage.start();
  }, [stage]);

  useFrame(() => {
    stage.journey.sample(stage.state.progress, sample, {
      station: stage.state.station,
      stationT: stage.state.stationT,
    });
  }, -15);

  /**
   * Take the camera while the editor is open.
   *
   * Otherwise the camera keeps flying to each station framing as you scrub,
   * and the whole scene swings while you are trying to place a point in it -
   * which reads as the path lurching away from you. Editing needs a still
   * camera you control; the composed shot is what Preview is for.
   */
  useEffect(() => {
    stage.editing = freeCamera;
    return () => {
      stage.editing = false;
    };
  }, [stage, freeCamera]);

  /**
   * Frame the whole path when the editor takes the camera.
   *
   * Freezing the camera wherever the page happened to leave it looks broken:
   * you get a close, arbitrary crop with most of the waypoints out of shot, so
   * the handles seem to be missing rather than merely off-screen. Fit the
   * curve, and the first thing you see is the thing you came to edit.
   *
   * Only when ENTERING free camera — refitting on every edit would yank the
   * view out from under a drag.
   */
  useEffect(() => {
    if (!freeCamera) return;

    const box = new THREE.Box3().setFromPoints(stage.journey.curve.getPoints(200));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    if (!(sphere.radius > 0)) return;

    const fov = THREE.MathUtils.degToRad(camera.fov ?? 45);
    const distance = (sphere.radius / Math.sin(fov / 2)) * 1.1;

    camera.position.set(
      sphere.center.x,
      sphere.center.y + sphere.radius * 0.3,
      sphere.center.z + distance
    );
    camera.near = Math.max(0.01, distance - sphere.radius * 4);
    camera.far = distance + sphere.radius * 8;
    camera.updateProjectionMatrix();
    camera.lookAt(sphere.center);

    if (controls?.target) {
      controls.target.copy(sphere.center);
      controls.update();
    }

    // `controls` is a dependency because OrbitControls only registers itself as
    // the default AFTER this component's first render. Without it the fit runs
    // once against no controls, and the orbit pivot stays stuck at the origin.
  }, [freeCamera, camera, controls, stage]);

  /**
   * Dev handle for harnesses: the camera, and where a waypoint lands on screen.
   *
   * Without this, testing "can you click a handle" means hunting for its colour
   * in a screenshot — which is exactly as unreliable as it sounds. R3F tone-maps
   * by default, so the rendered pixel is nowhere near the hex in the source, and
   * a decoder that guesses the PNG's channel count silently reads zeroes. Asking
   * the page to project the point is deterministic.
   */
  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
      return undefined;
    }

    /**
     * Publish the stage too, when nothing else has.
     *
     * <Stage> publishes it on mount, but the editor is designed to work
     * WITHOUT <Stage> - and on such a page no handle exists at all, so a
     * harness or a console has nothing to ask. The editor holds the real
     * stage, passed in by the host, so it is a safe authority.
     */
    window.__rossa = stage;

    window.__rossaEditor = {
      camera,
      controls,
      get doc() {
        return doc;
      },
      get selection() {
        return selection;
      },
      /** Screen position, in CSS pixels, of an arbitrary world point. */
      screenOfWorld(x, y, z) {
        const v = new THREE.Vector3(x, y, z).project(camera);
        return {
          x: ((v.x + 1) / 2) * gl.domElement.clientWidth,
          y: ((1 - v.y) / 2) * gl.domElement.clientHeight,
          behind: v.z > 1,
        };
      },

      /** The world position of path row `index`, station rows resolved. */
      worldOf(index) {
        const row = stage.journey.path[index];
        if (!row) return null;
        return [stage.journey.toWorldX(row.sx, row.z), row.y, row.z];
      },

      /** Screen position, in CSS pixels, of path row `index`. */
      screenOf(index) {
        const row = stage.journey.path[index];
        if (!row) return null;

        const world = new THREE.Vector3(
          stage.journey.toWorldX(row.sx, row.z),
          row.y,
          row.z
        ).project(camera);

        return {
          x: ((world.x + 1) / 2) * gl.domElement.clientWidth,
          y: ((1 - world.y) / 2) * gl.domElement.clientHeight,
          behind: world.z > 1,
        };
      },
    };

    return () => {
      delete window.__rossaEditor;
      if (window.__rossa === stage) delete window.__rossa;
    };
  }, [camera, controls, doc, selection, stage, gl]);

  /**
   * Raise the canvas above the page — every ancestor, not just the parent.
   *
   * `canvas.parentElement` is R3F's OWN wrapper div, not the host's positioning
   * container. Raising that achieves nothing, because it sits inside the host's
   * container, and the usual host container is something like
   * `fixed inset-0 -z-10` — deliberately behind the page. The canvas stayed
   * buried, every click landed on a <section>, and the handles looked broken
   * rather than merely unreachable.
   *
   * So walk the chain up to <body> and lift all of it. A static ancestor gets
   * `position: relative` first, since z-index does nothing without a position.
   *
   * Wheel events still reach the document, so the page goes on scrolling
   * underneath; only text selection is lost, which is the right trade while you
   * are dragging a flight path over it.
   */
  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return undefined;

    const raised = [];

    const lift = (el, zIndex, pointerEvents) => {
      raised.push({
        el,
        zIndex: el.style.zIndex,
        position: el.style.position,
        pointerEvents: el.style.pointerEvents,
      });

      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      el.style.zIndex = zIndex;
      el.style.pointerEvents = pointerEvents;
    };

    // The canvas chain comes up, so R3F can see a pointer at all.
    let top = canvas.parentElement;
    for (let el = canvas.parentElement; el && el !== document.body; el = el.parentElement) {
      lift(el, "2147483000", "auto");
      top = el;
    }

    /**
     * The page content goes ABOVE the canvas, but click-through.
     *
     * Raising the canvas alone buries the page: most hosts paint an opaque
     * scene, so the copy you are meant to be steering around vanishes behind
     * it, and you are back to authoring against an abstraction — the exact
     * failure that justified putting the editor inside the host page.
     *
     * So the copy is lifted over the canvas to stay legible, with pointer
     * events switched off so clicks fall straight through to the handles
     * underneath. You see the real page AND can still grab a waypoint through
     * it.
     */
    for (const el of Array.from(document.body.children)) {
      if (el === top || el === overlay || el.contains(canvas)) continue;
      if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
      el.dataset.rossaLifted = "";
      lift(el, "2147483001", "none");
    }

    /**
     * Strip the lifted content's own backgrounds.
     *
     * Lifting the copy over the canvas only reveals it if the copy is
     * TRANSPARENT. Most sites paint their sections, so the page simply goes
     * back over the 3D and you get a normal-looking website with an editor
     * panel beside it and no path visible anywhere — worse than either choice
     * on its own.
     *
     * Note that `pointer-events: none` is not evidence either way here:
     * elementFromPoint happily reports the canvas underneath while the section
     * is still painting on top of it. Hit-testing and paint order are different
     * questions, and confusing them sends you looking for a phantom overlay.
     *
     * Backgrounds are knocked out for the duration. Buttons, links and inputs
     * keep theirs, so the page still reads as a page.
     */
    const backgrounds = document.createElement("style");
    backgrounds.dataset.rossaBg = "";
    backgrounds.textContent =
      "[data-rossa-lifted],[data-rossa-lifted] *:not(button):not(a):not(input)" +
      "{background-color:transparent!important;background-image:none!important}";
    document.head.appendChild(backgrounds);

    return () => {
      backgrounds.remove();
      for (const previous of raised) {
        delete previous.el.dataset.rossaLifted;
        previous.el.style.zIndex = previous.zIndex;
        previous.el.style.position = previous.position;
        previous.el.style.pointerEvents = previous.pointerEvents;
      }
    };
  }, [gl, overlay]);


  useEffect(() => {
    if (!overlay) return undefined;

    /**
     * Stretch drei's wrapper to fill the overlay.
     *
     * drei sizes its container to its content, so it is a 0x0 box — and a
     * panel inside it styled `right: 0; top: 0; bottom: 0` resolves those
     * against nothing, coming out zero-height and a full panel-width off the
     * left edge. Percentages inherit the same zero, and viewport units are off
     * by the scrollbar. Sizing the wrapper against the overlay, which is
     * exactly the viewport, is the only version that is exact.
     *
     * The transform goes too: calculatePosition already pins this to [0, 0],
     * and an identity transform still creates a containing block.
     */
    const style = document.createElement("style");
    style.textContent =
      "[data-rossa-overlay] > div{position:absolute!important;" +
      "top:0!important;left:0!important;width:100%!important;" +
      "height:100%!important;transform:none!important;}";

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    return () => {
      overlay.remove();
      style.remove();
    };
  }, [overlay]);

  /**
   * Rebuild the live journey from the working document as it is edited, so the
   * subject on screen flies the path you are dragging. Without this the editor
   * would be a diagram next to the thing it claims to control.
   */
  useEffect(() => {
    try {
      stage.rebuild(doc);
      setStatus(null);
    } catch (error) {
      // An invalid intermediate state (a p dragged past its neighbour) should
      // say so, not throw the page away.
      setStatus({ kind: "error", message: error.message });
    }
  }, [doc, stage]);

  const updatePoint = (index, patch) =>
    setDoc((previous) => {
      const path = previous.path.map((row, i) =>
        i === index ? { ...row, ...patch } : row
      );
      return { ...previous, path };
    });

  const updateStationKey = (stationId, track, keyIndex, patch) =>
    setDoc((previous) => ({
      ...previous,
      stations: previous.stations.map((s) =>
        s.id !== stationId
          ? s
          : {
              ...s,
              [track]: s[track].map((key, i) =>
                i === keyIndex ? { ...key, ...patch } : key
              ),
            }
      ),
    }));

  /**
   * Add a waypoint where the reader currently is.
   *
   * Its position is sampled from the existing curve, so adding one changes
   * nothing until you move it. An insert that jumped the path would make adding
   * a point something you have to undo before you can use it.
   */
  const addPoint = () =>
    setDoc((previous) => {
      const p = Number(stage.state.progress.toFixed(4));
      if (previous.path.some((row) => Math.abs(row.p - p) < 0.002)) return previous;

      const here = stage.journey.sample(p);
      const z = Number(here.travel.z.toFixed(3));

      const row = {
        p,
        sx: Number(stage.journey.toScreenX(here.travel.x, z).toFixed(3)),
        y: Number(here.travel.y.toFixed(3)),
        z,
      };

      const path = [...previous.path, row].sort((a, b) => a.p - b.p);
      return { ...previous, path };
    });

  const removePoint = (index) =>
    setDoc((previous) => {
      // The spline needs two points to exist at all.
      if (previous.path.length <= 2) return previous;
      return { ...previous, path: previous.path.filter((_, i) => i !== index) };
    });

  const updateCamera = (patch) =>
    setDoc((previous) => ({
      ...previous,
      camera: { ...previous.camera, ...patch },
    }));

  /** World in, screen space out — the whole reason this editor exists. */
  const screenPatch = (position) => ({
    sx: Number(journey.toScreenX(position.x, position.z).toFixed(3)),
    y: Number(position.y.toFixed(3)),
    z: Number(position.z.toFixed(3)),
  });

  /**
   * With no endpoint, Save downloads the document instead of writing it.
   *
   * A statically hosted playground has no server to POST to, and posting into
   * a 404 would report a network error for something that is working exactly as
   * intended. `endpoint={null}` says so out loud, and the button relabels itself
   * so nobody waits for a file that was never going to be written.
   */
  const save = async () => {
    if (!endpoint) {
      const url = URL.createObjectURL(
        new Blob([serializeDocument(doc)], { type: "application/json" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "journey.json";
      link.click();
      URL.revokeObjectURL(url);
      setStatus({ kind: "ok", message: "Downloaded journey.json" });
      return;
    }

    setStatus({ kind: "busy", message: "Saving…" });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: doc }),
      });
      const body = await response.json().catch(() => ({}));
      setStatus(
        response.ok
          ? { kind: "ok", message: `Saved ${body.file || "journey.json"}` }
          : { kind: "error", message: body.error || `HTTP ${response.status}` }
      );
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(serializeDocument(doc));
    setStatus({ kind: "ok", message: "Document copied" });
  };

  const station =
    selection?.kind === "station"
      ? doc.stations.find((s) => s.id === selection.id)
      : null;

  return (
    <group>
      <Occlusion stage={stage} selector={copySelector} />

      {freeCamera ? <OrbitControls makeDefault enableDamping /> : null}

      <Waypoints
        stage={stage}
        sample={sample}
        points={doc.path}
        selected={selection?.kind === "path" ? selection.index : null}
        onSelect={(index) => setSelection({ kind: "path", index })}
        onDrag={(index, position) => updatePoint(index, screenPatch(position))}
        onDragStateChange={setDragging}
      />

      {station ? (
        <StationKeys
          stage={stage}
          station={station}
          selection={selection}
          onSelect={setSelection}
          onDrag={(keyIndex, position) =>
            updateStationKey(station.id, "subject", keyIndex, screenPatch(position))
          }
          onDragStateChange={setDragging}
        />
      ) : null}

      <Html
        portal={{ current: overlay }}
        // The panel is chrome, not an annotation on a point in the scene:
        // pinning it to the overlay's origin keeps it still while the camera
        // moves underneath it.
        calculatePosition={() => [0, 0]}
        /**
         * Give the wrapper the viewport's dimensions.
         *
         * drei sizes its container to its content, so by default it is a 0x0
         * box — and a panel inside it styled `right: 0; top: 0; bottom: 0`
         * resolves those against nothing, coming out full width off the left
         * edge with zero height. drei spreads this `style` last, so these win.
         */
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
        zIndexRange={[60, 60]}
      >
        <Panel
          stage={stage}
          doc={doc}
          selection={selection}
          onSelect={setSelection}
          onUpdatePoint={updatePoint}
          onUpdateStationKey={updateStationKey}
          onUpdateCamera={updateCamera}
          onAddPoint={addPoint}
          onRemovePoint={removePoint}
          onSave={save}
          canWrite={!!endpoint}
          onCopy={copy}
          status={status}
          dragging={dragging}
          freeCamera={freeCamera}
          onToggleCamera={() => setFreeCamera((v) => !v)}
        />
      </Html>
    </group>
  );
}

/**
 * A station's subject framing, as two draggable handles.
 *
 * This is the half of the document that was previously unreachable without
 * hand-editing `lerp()` calls — and it is the half that governs the moments
 * the page actually stops to look at something.
 */
function StationKeys({ stage, station, selection, onSelect, onDrag, onDragStateChange }) {
  const journey = stage.journey;

  const positions = useMemo(
    () =>
      station.subject.map((key) => {
        const sx = key.sx ?? 0;
        const z = key.z ?? 0;
        return new THREE.Vector3(journey.toWorldX(sx, z), key.y ?? 0, z);
      }),
    [station, journey]
  );

  return (
    <group>
      {positions.map((position, i) => {
        const isSelected = selection?.kind === "station" && selection.key === i;

        const handle = (
          <mesh
            position={isSelected ? [0, 0, 0] : position.toArray()}
            onClick={(event) => {
              event.stopPropagation();
              onSelect({ kind: "station", id: station.id, key: i });
            }}
          >
            <boxGeometry args={[0.22, 0.22, 0.22]} />
            <meshBasicMaterial color={isSelected ? "#ffffff" : "#9b6bff"} />
          </mesh>
        );

        if (!isSelected) return <group key={i}>{handle}</group>;

        return (
          <TransformControls
            key={i}
            mode="translate"
            size={0.65}
            position={position.toArray()}
            onMouseDown={() => onDragStateChange?.(true)}
            onMouseUp={() => onDragStateChange?.(false)}
            onObjectChange={(event) => {
              const object = event?.target?.object;
              if (object) onDrag(i, object.position);
            }}
          >
            {handle}
          </TransformControls>
        );
      })}
    </group>
  );
}
