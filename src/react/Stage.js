"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * The stage, inside the Canvas. Samples the journey and directs the camera.
 *
 * Frame ordering matters and is expressed with useFrame priorities:
 *
 *   -20  sample the journey        (everything downstream reads this)
 *   -10  subjects place themselves (useSubject)
 *    -1  the camera reacts to where the subject ended up
 *
 * All NEGATIVE on purpose. In R3F a positive priority takes over the render
 * loop and makes you call gl.render() yourself; negative priorities only order
 * the callbacks, so automatic rendering still happens after all of them.
 */

const _followPos = new THREE.Vector3();
const _followTarget = new THREE.Vector3();

export default function Stage({
  stage,
  children,
  progress,
  follow = true,
  parallax = 0,
  damping = 4.5,
  stationDamping = 3.2,
}) {
  const { camera } = useThree();
  const state = stage.state;

  const current = useMemo(
    () => ({
      position: new THREE.Vector3(0, 0, 6),
      target: new THREE.Vector3(),
      parallax: { x: 0, y: 0 },
    }),
    []
  );

  /**
   * Publish the MOUNTED stage for headless harnesses and the console.
   *
   * Published from here rather than from createStage(), because under
   * StrictMode the memo factory runs more than once and only one of the stages
   * it produces ends up in the tree. A handle written at construction time can
   * therefore point at a stage that nothing is driving — which looks exactly
   * like a dead render loop and sends you hunting for the wrong bug.
   */
  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
      return undefined;
    }
    window.__rossa = stage;
    return () => {
      if (window.__rossa === stage) delete window.__rossa;
    };
  }, [stage]);

  useEffect(() => {
    // An externally driven progress (Lenis, GSAP, a scrubber) means the
    // stage's own scroll loop would fight it.
    if (progress === undefined) {
      stage.start();
      return () => stage.stop();
    }
    return undefined;
  }, [stage, progress]);

  // --- 1. Sample the journey ------------------------------------------------
  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);

    state.frames++;

    if (progress !== undefined) state.progress = progress;

    /**
     * The measured pin wins over the document's idea of where a station is.
     * Passing it in explicitly (rather than letting the journey derive it from
     * progress) is what keeps the choreography attached to the real layout.
     */
    stage.journey.sample(state.progress, state.sample, {
      station: state.station,
      stationT: state.stationT,
    });

    // Damped, not set: arriving at a station is a move that settles, never a
    // cut. This is runtime state, which is exactly why core does not own it.
    state.held = THREE.MathUtils.damp(
      state.held,
      state.sample.held,
      stationDamping,
      dt
    );
  }, -20);

  // --- 2. Direct the camera -------------------------------------------------
  useFrame((frameState, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const sample = state.sample;
    const subject = sample.subjectWorld;

    /**
     * TRAVEL is a soft lean, not a chase.
     *
     * A true chase camera — sitting behind the subject along its heading — is
     * wrong for this kind of page and was tried. Everything is authored in
     * screen space from a viewpoint near the document's lens: the sx corridor
     * that keeps the subject off the copy, the station framings, the depth of
     * every atmospheric layer. Putting the camera behind a subject that is
     * itself at negative z invalidates all of it, and the clamp that keeps the
     * camera on the viewer's side then leaves it looking AWAY from the subject.
     *
     * So the lens holds its authored viewpoint and leans. Travel is sold by the
     * world streaming past, not by flying the camera through it.
     */
    if (follow) {
      _followPos.set(
        subject.x * 0.22,
        sample.beats.camY + subject.y * 0.18,
        sample.beats.camZ
      );
      _followTarget.set(subject.x * 0.42, subject.y * 0.32, 0);
    } else {
      _followPos.set(0, sample.beats.camY, sample.beats.camZ);
      _followTarget.set(0, 0, 0);
    }

    const k = state.held;

    if (sample.station) {
      current.position.lerpVectors(_followPos, sample.camera.position, k);
      current.target.lerpVectors(_followTarget, sample.camera.target, k);
    } else {
      current.position.copy(_followPos);
      current.target.copy(_followTarget);
    }

    if (parallax > 0) {
      current.parallax.x = THREE.MathUtils.damp(
        current.parallax.x,
        frameState.pointer.x * parallax,
        2.5,
        dt
      );
      current.parallax.y = THREE.MathUtils.damp(
        current.parallax.y,
        frameState.pointer.y * parallax * 0.57,
        2.5,
        dt
      );
    }

    const ease = 1 - Math.exp(-damping * dt);
    camera.position.lerp(current.position, ease);
    camera.position.x += current.parallax.x;
    camera.position.y += current.parallax.y;
    camera.lookAt(current.target);

    const fov = THREE.MathUtils.lerp(
      sample.beats.fov,
      sample.camera.fov,
      sample.station ? k : 0
    );
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = THREE.MathUtils.damp(camera.fov, fov, 4, dt);
      camera.updateProjectionMatrix();
    }
  }, -1);

  return children ?? null;
}
