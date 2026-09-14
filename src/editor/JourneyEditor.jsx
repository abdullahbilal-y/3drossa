"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Html, TransformControls } from "@react-three/drei";
import { serializeDocument } from "../core/index.js";
import Occlusion from "./Occlusion.jsx";
import Waypoints from "./Waypoints.jsx";
import Panel from "./Panel.jsx";

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
  const { gl } = useThree();

  /** The working document. Edits land here; Save writes it to disk. */
  const [doc, setDoc] = useState(() => structuredClone(journey.doc));
  const [selection, setSelection] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(null);

  /**
   * Raise the canvas above the page.
   *
   * The host's DOM normally sits on top of the canvas — in most layouts the
   * canvas is a fixed backdrop at a negative z-index — so R3F never sees a
   * pointer event and the handles look broken rather than unclickable. While
   * the editor is open the canvas comes to the front.
   *
   * Wheel events still reach the document, so the page goes on scrolling
   * normally underneath; only text selection is lost, which is the correct
   * trade while you are dragging a flight path over it.
   */
  useEffect(() => {
    const container = gl.domElement.parentElement;
    if (!container) return;

    const previous = {
      zIndex: container.style.zIndex,
      pointerEvents: container.style.pointerEvents,
    };

    container.style.zIndex = "40";
    container.style.pointerEvents = "auto";

    return () => {
      container.style.zIndex = previous.zIndex;
      container.style.pointerEvents = previous.pointerEvents;
    };
  }, [gl]);

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
    el.style.cssText = "position:fixed;inset:0;z-index:60;pointer-events:none;";
    return el;
  }, []);

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

  /** World in, screen space out — the whole reason this editor exists. */
  const screenPatch = (position) => ({
    sx: Number(journey.toScreenX(position.x, position.z).toFixed(3)),
    y: Number(position.y.toFixed(3)),
    z: Number(position.z.toFixed(3)),
  });

  const save = async () => {
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

      <Waypoints
        stage={stage}
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
          onSave={save}
          onCopy={copy}
          status={status}
          dragging={dragging}
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
