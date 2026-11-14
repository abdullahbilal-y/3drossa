"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import useDragPlane from "./useDragPlane.js";
import { orbitFromOffset } from "../core/index.js";

export { orbitFromOffset };

/**
 * The orbit, drawn and draggable — the camera's route when it circles a target.
 *
 * Without this an orbit existed only as numbers in the Camera section. On a
 * product page, where the subject stands still and has no path, the editor
 * then showed nothing at all in the scene: the one moving thing on the page
 * was the one thing it could not draw.
 *
 * One handle per orbit row, where that row puts the lens, with a sight line to
 * the point it circles. The line between them is sampled from the journey
 * itself, so it bends exactly as the camera will, easing included. Dragging a
 * handle moves the lens in the world and writes it back as the azimuth,
 * elevation and distance the document stores.
 */

const ROUTE = "#ff7ad9";
const SIGHT = "#7ad9ff";
const SELECTED = "#ffffff";

const DEG = 180 / Math.PI;

function rowOffset(row, out = new THREE.Vector3()) {
  const az = row.azimuth / DEG;
  const el = row.elevation / DEG;
  const flat = Math.cos(el) * row.distance;
  return out.set(Math.sin(az) * flat, Math.sin(el) * row.distance, Math.cos(az) * flat);
}

export default function OrbitPath({
  rows,
  journey,
  centre,
  selected,
  onSelect,
  onDrag,
  onDragStateChange,
  live,
}) {
  const marker = useRef(null);
  const centreVec = useMemo(() => new THREE.Vector3().fromArray(centre), [centre]);

  const handles = useMemo(
    () => rows.map((row) => rowOffset(row).add(centreVec)),
    [rows, centreVec]
  );

  const line = useMemo(() => {
    const out = { offset: new THREE.Vector3(), fov: undefined };
    const points = [];
    for (let i = 0; i <= 240; i++) {
      if (!journey.sampleOrbit(i / 240, out)) return null;
      points.push(out.offset.clone().add(centreVec));
    }
    return points;
  }, [journey, rows, centreVec]);

  useFrame(() => {
    if (marker.current && live) marker.current.position.copy(live).add(centreVec);
  });

  const beginDrag = useDragPlane(
    (index, position) => onDrag(index, position.clone().sub(centreVec)),
    onDragStateChange
  );

  return (
    <group>
      {line ? <Line points={line} color={ROUTE} lineWidth={1.5} transparent opacity={0.9} /> : null}

      {handles.map((position, i) => (
        <Line
          key={`sight-${i}`}
          points={[position, centreVec]}
          color={SIGHT}
          lineWidth={1}
          transparent
          opacity={0.3}
        />
      ))}

      {handles.map((position, i) => (
        <mesh
          key={`row-${i}`}
          position={position.toArray()}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect(i);
            beginDrag(i, position);
          }}
        >
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshBasicMaterial color={selected === i ? SELECTED : ROUTE} fog={false} />
        </mesh>
      ))}

      {/* The point being circled. */}
      <mesh position={centreVec.toArray()}>
        <octahedronGeometry args={[0.1]} />
        <meshBasicMaterial color={SIGHT} fog={false} />
      </mesh>

      {live ? (
        <mesh ref={marker}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color={ROUTE} fog={false} />
        </mesh>
      ) : null}
    </group>
  );
}
