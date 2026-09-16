"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

/**
 * Dragging a handle: raycast against a plane, not a gizmo.
 *
 * drei's TransformControls was tried first and never received a single pointer
 * event here, while R3F's own click events on the same meshes worked fine — so
 * selection worked and dragging silently did not, which reads as "it moves when
 * I click but I cannot hold it". Rather than keep guessing at why a third-party
 * control was deaf, this listens on the window and intersects a plane through
 * the point, facing the camera. Thirty lines, one dependency fewer, and it uses
 * the event path that was already demonstrably working.
 *
 * The plane sits at the handle's OWN depth so it stays exactly under the
 * pointer — no creep, no acceleration with distance.
 *
 * Shared by the subject's waypoints and the camera's, which differ only in what
 * they do with the world point that comes out: a waypoint converts it to screen
 * space, a camera position is already world space.
 */
export default function useDragPlane(onDrag, onDragStateChange) {
  const { camera, gl } = useThree();
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

  const begin = useCallback(
    (key, origin) => {
      camera.getWorldDirection(scratch.normal);
      scratch.plane.setFromNormalAndCoplanarPoint(scratch.normal, origin);
      drag.current = { key };
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
        onDrag(drag.current.key, scratch.hit);
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

  return begin;
}
