"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line, TransformControls } from "@react-three/drei";

/**
 * The path, its handles, and the gizmo.
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
  sample,
  points,
  selected,
  onSelect,
  onDrag,
  onDragStateChange,
}) {
  const journey = stage.journey;
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
   * see is the line the document currently describes — not the one the page
   * was loaded with.
   */
  const line = useMemo(() => {
    const { curveType, tension, closed } = journey.doc.curve;
    const curve = new THREE.CatmullRomCurve3(world, closed, curveType, tension);
    return curve.getPoints(400);
  }, [world, journey]);

  // The live position, from the editor own sample - so the marker is correct
  // even on a page where no <Stage> is mounted to write one.
  useFrame(() => {
    if (marker.current) marker.current.position.copy(sample.travel);
  });

  return (
    <group>
      <Line points={line} color="#8fd9ff" lineWidth={1.5} transparent opacity={0.85} />

      {world.map((position, i) => {
        const point = points[i];
        const derived = point.station !== undefined;
        const isSelected = selected === i;

        const handle = (
          <mesh
            position={isSelected && !derived ? [0, 0, 0] : position.toArray()}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(i);
            }}
          >
            <sphereGeometry args={[0.15, 20, 20]} />
            <meshBasicMaterial
              color={isSelected ? SELECTED : derived ? DERIVED : AUTHORED}
            />
          </mesh>
        );

        /**
         * TransformControls attaches to its CHILDREN. Given none it has
         * nothing to move — the gizmo appears and dragging silently does
         * nothing. So the selected handle is rendered INSIDE it, and the
         * gizmo's own group carries the position.
         *
         * Station-derived rows get a handle but no gizmo: their position comes
         * from the station's framing, and a drag here would write a value the
         * next render throws away. They are moved by dragging the station
         * keyframe instead.
         */
        if (isSelected && !derived) {
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
        }

        return <group key={i}>{handle}</group>;
      })}

      {/* Where the subject actually is at the current scroll position. */}
      <mesh ref={marker}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}
