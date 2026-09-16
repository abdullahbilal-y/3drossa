"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import useDragPlane from "./useDragPlane.js";

/**
 * The camera's own route, drawn and draggable.
 *
 * Two handles per row, not one. Where the lens IS and what it looks AT move
 * independently, and that independence is the whole expressive point: a single
 * curve plus its tangent gives you a rollercoaster — the lens can only face the
 * way it is travelling, so it can never hold on something while it moves past
 * it, which is the shot people want a camera path for in the first place.
 *
 * You will normally author this with the editor holding the camera ("Camera:
 * free"). In page view the lens is ON this path, so the handle you are trying
 * to grab is the eye you are looking through.
 */

const POSITION = "#ff7ad9";
const TARGET = "#7ad9ff";
const SELECTED = "#ffffff";

export default function CameraPath({
  rows,
  curveConfig,
  selected,
  onSelect,
  onDrag,
  onDragStateChange,
  live,
}) {
  const marker = useRef(null);

  const positions = useMemo(
    () => rows.map((r) => new THREE.Vector3().fromArray(r.position)),
    [rows]
  );
  const targets = useMemo(
    () => rows.map((r) => new THREE.Vector3().fromArray(r.target)),
    [rows]
  );

  /** Rebuilt from the working document, so the line is what the doc says now. */
  const line = useMemo(() => {
    if (positions.length < 2) return null;
    const { curveType, tension } = curveConfig;
    return new THREE.CatmullRomCurve3(positions, false, curveType, tension).getPoints(
      300
    );
  }, [positions, curveConfig]);

  const aimLine = useMemo(() => {
    if (targets.length < 2) return null;
    const { curveType, tension } = curveConfig;
    return new THREE.CatmullRomCurve3(targets, false, curveType, tension).getPoints(300);
  }, [targets, curveConfig]);

  /** Where the lens is at the current scroll position, as you scrub. */
  useFrame(() => {
    if (marker.current && live) marker.current.position.copy(live.position);
  });

  const beginDrag = useDragPlane(onDrag, onDragStateChange);

  const handle = (kind, i, position, colour) => {
    const isSelected = selected?.row === i && selected?.field === kind;
    return (
      <mesh
        key={`${kind}-${i}`}
        position={position.toArray()}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect({ row: i, field: kind });
          beginDrag({ row: i, field: kind }, position);
        }}
      >
        {kind === "position" ? (
          <boxGeometry args={[0.2, 0.2, 0.2]} />
        ) : (
          <octahedronGeometry args={[0.13]} />
        )}
        <meshBasicMaterial color={isSelected ? SELECTED : colour} />
      </mesh>
    );
  };

  return (
    <group>
      {line ? (
        <Line points={line} color={POSITION} lineWidth={1.5} transparent opacity={0.9} />
      ) : null}
      {aimLine ? (
        <Line
          points={aimLine}
          color={TARGET}
          lineWidth={1}
          dashed
          dashSize={0.18}
          gapSize={0.12}
          transparent
          opacity={0.6}
        />
      ) : null}

      {/* A sight line per row, so it is obvious which eye looks at which point. */}
      {positions.map((position, i) => (
        <Line
          key={`sight-${i}`}
          points={[position, targets[i]]}
          color={TARGET}
          lineWidth={1}
          transparent
          opacity={0.3}
        />
      ))}

      {positions.map((position, i) => handle("position", i, position, POSITION))}
      {targets.map((target, i) => handle("target", i, target, TARGET))}

      {live ? (
        <mesh ref={marker}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color={POSITION} />
        </mesh>
      ) : null}
    </group>
  );
}
