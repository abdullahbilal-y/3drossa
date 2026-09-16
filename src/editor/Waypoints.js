"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";

/**
 * The path and its handles.
 *
 * The one thing a generic spline editor cannot do, and the reason this exists:
 * it drags in WORLD space and stores SCREEN space. Every generic editor
 * (three.js's own, zz85's, the Cientos one) edits raw XYZ, which throws away
 * the property that makes the table work — that a waypoint clears the copy at
 * every depth, not just at the depth it was placed.
 *
 * Dragging is plain raycasting against a plane, not a gizmo.
 *
 * drei's TransformControls was tried first and never received a single pointer
 * event here, while R3F's own click events on the same meshes worked fine — so
 * selection worked and dragging silently did not, which reads as "it moves when
 * I click but I cannot hold it". Rather than keep guessing at why a third-party
 * control was deaf, this listens on the window and intersects a plane through
 * the point, facing the camera. Thirty lines, one dependency fewer, and it uses
 * the event path that was already demonstrably working.
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
  const { camera, gl } = useThree();
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

  const drag = useRef(null);
  const scratch = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      plane: new THREE.Plane(),
      normal: new THREE.Vector3(),
      hit: new THREE.Vector3(),
    }),
    []
  );

  const beginDrag = useCallback(
    (index, origin) => {
      /**
       * Drag in the plane facing the camera, through the point itself.
       *
       * A plane at the point's own depth means the handle stays exactly under
       * the pointer — no creep, no acceleration with distance. Depth (z) is left
       * alone and typed in the panel: dragging depth in a 2D gesture is a guess,
       * and z is the axis that decides whether the subject passes in front of
       * the copy or behind it.
       */
      camera.getWorldDirection(scratch.normal);
      scratch.plane.setFromNormalAndCoplanarPoint(scratch.normal, origin);
      drag.current = { index };
      onDragStateChange?.(true);
    },
    [camera, scratch, onDragStateChange]
  );

  useEffect(() => {
    const canvas = gl.domElement;

    const move = (event) => {
      if (!drag.current) return;

      const rect = canvas.getBoundingClientRect();
      scratch.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      scratch.raycaster.setFromCamera(scratch.pointer, camera);

      if (scratch.raycaster.ray.intersectPlane(scratch.plane, scratch.hit)) {
        onDrag(drag.current.index, scratch.hit);
      }
    };

    const end = () => {
      if (!drag.current) return;
      drag.current = null;
      onDragStateChange?.(false);
    };

    // On the window, not the canvas: a fast drag routinely leaves the canvas,
    // and a listener that stops at its edge drops the gesture halfway.
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [camera, gl, onDrag, onDragStateChange, scratch]);

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
              // Station rows are shown but not draggable: their position comes
              // from lib/journey.js, and a drag here would write a value the
              // next render throws away.
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
