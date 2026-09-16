"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import useDragPlane from "./useDragPlane.js";

/**
 * The subject's path and its handles.
 *
 * The one thing a generic spline editor cannot do, and the reason this exists:
 * it drags in WORLD space and stores SCREEN space. Every generic editor
 * (three.js's own, zz85's, the Cientos one) edits raw XYZ, which throws away
 * the property that makes the table work — that a waypoint clears the copy at
 * every depth, not just at the depth it was placed.
 */

const AUTHORED = "#f5a623";
const DERIVED = "#2e9d8f";
const SELECTED = "#ffffff";

export default function Waypoints({
  stage,
  journey,
  sample,
  points,
  selected,
  onSelect,
  onDrag,
  onDragStateChange,
}) {
  const marker = useRef(null);

  /** Resolve every row to world space, deriving station rows from the station. */
  const world = useMemo(
    () =>
      points.map((pt) => {
        if (pt.station !== undefined) {
          const framing = journey.stationSubject(pt.station, pt.at);
          return new THREE.Vector3(
            journey.toWorldX(framing.sx, framing.z),
            framing.y,
            framing.z
          );
        }
        return new THREE.Vector3(journey.toWorldX(pt.sx, pt.z), pt.y, pt.z);
      }),
    [points, journey]
  );

  /**
   * The curve is rebuilt from the WORKING table on every edit, so the line you
   * see is the line the document currently describes — not the one the page was
   * loaded with.
   */
  const line = useMemo(() => {
    const { curveType, tension, closed } = journey.doc.curve;
    const curve = new THREE.CatmullRomCurve3(world, closed, curveType, tension);
    return curve.getPoints(400);
  }, [world, journey]);

  /**
   * The marker shows where the SUBJECT is, not where the curve is.
   *
   * Those are not the same thing, and showing the curve was actively
   * misleading: a host is free to add idle motion, damping, a retreat on dense
   * sections or a station override, all of which move the object away from the
   * path on purpose. A marker gliding down the curve while the subject sits
   * somewhere else reads as "the subject is not following the path" — when in
   * fact the marker was the thing telling the wrong story.
   *
   * Falls back to the curve when the host publishes nothing, which is the case
   * on a page driven entirely by the engine.
   */
  useFrame(() => {
    if (!marker.current) return;
    const subject = stage.state.subject;
    if (subject) marker.current.position.set(subject.x, subject.y, subject.z);
    else marker.current.position.copy(sample.travel);
  });

  const beginDrag = useDragPlane(onDrag, onDragStateChange);

  return (
    <group>
      <Line points={line} color="#8fd9ff" lineWidth={1.5} transparent opacity={0.85} />

      {world.map((position, i) => {
        const point = points[i];
        const derived = point.station !== undefined;
        const isSelected = selected === i;

        return (
          <mesh
            key={i}
            position={position.toArray()}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect(i);
              /**
               * Station rows are shown but not draggable: their position is
               * DERIVED from the station, so a drag here would write a value
               * the next render throws away. Move the station's keyframe
               * instead and the handoff follows it — which is the whole reason
               * the two cannot drift apart.
               */
              if (!derived) beginDrag(i, position);
            }}
          >
            <sphereGeometry args={[0.16, 20, 20]} />
            <meshBasicMaterial
              color={isSelected ? SELECTED : derived ? DERIVED : AUTHORED}
            />
          </mesh>
        );
      })}

      {/* Where the subject actually is at the current scroll position. */}
      <mesh ref={marker}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}
