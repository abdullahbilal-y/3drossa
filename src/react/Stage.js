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
// Where the camera is actually heading, parallax included.
const _aim = new THREE.Vector3();

/**
 * Props are OVERRIDES, not the source of truth.
 *
 * Camera behaviour lives in the document so the editor can change it and save
 * it. Leaving these undefined - which is the normal case - uses the document.
 */
export default function Stage({
  stage,
  children,
  progress,
  follow,
  parallax,
  damping,
  stationDamping,
}) {
  const { camera, scene } = useThree();
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
    // The camera and the scene, so a harness can measure what the reader
    // actually sees — and check that what the page was asked to render is
    // really in the graph, rather than inferring it from pixels.
    stage.camera = camera;
    stage.scene = scene;
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
      stationDamping ?? stage.journey.doc.camera.damping.station,
      dt
    );
  }, -20);

  // --- 2. Direct the camera -------------------------------------------------
  useFrame((frameState, delta) => {
    // The editor has the camera. Driving it from here as well would swing the
    // scene to each station framing while someone is trying to place a point.
    if (stage.editing) return;

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
    // Every coefficient below comes from the document, so all of it is
    // editable and saveable — including "do not move the camera at all".
    const config = stage.journey.doc.camera;
    const mode = follow === false ? "beats" : follow === true ? "follow" : config.mode;
    const px = parallax ?? config.parallax.x;
    const py = parallax !== undefined ? parallax * 0.57 : config.parallax.y;

    /**
     * The base field of view, before a station takes over.
     *
     * A LOCKED lens holds `camera.fov` (falling back to the document's lens)
     * and deliberately ignores the beats track. Locked used to mean locked in
     * POSITION only, so fov went on tracking beats — a camera the author had
     * explicitly nailed down still drifted a few degrees in and out across the
     * page, which reads as a slow zoom nobody asked for, and is never the zoom
     * you wanted anyway: the beats track is written for a following camera.
     */
    let baseFov = sample.beats.fov;

    if (mode === "locked") {
      _followPos.fromArray(config.position);
      _followTarget.fromArray(config.target);
      baseFov = config.fov ?? stage.journey.doc.lens.fov;
    } else if (mode === "path" && sample.hasCameraPath) {
      /**
       * The lens flies its own spline.
       *
       * Its target is either the second spline or the subject. Aiming at the
       * subject is the common case for a flythrough — you want to choose the
       * route without also hand-authoring where the lens points at every
       * moment of it.
       */
      _followPos.copy(sample.cameraPath.position);
      _followTarget.copy(
        config.pathTarget === "subject" ? subject : sample.cameraPath.target
      );
      if (sample.cameraPath.fov !== undefined) baseFov = sample.cameraPath.fov;
    } else if (mode === "follow") {
      _followPos.set(
        subject.x * config.follow.x,
        sample.beats.camY + subject.y * config.follow.y,
        sample.beats.camZ
      );
      _followTarget.set(
        subject.x * config.follow.targetX,
        subject.y * config.follow.targetY,
        0
      );
    } else {
      _followPos.set(0, sample.beats.camY, sample.beats.camZ);
      _followTarget.set(0, 0, 0);
    }

    const k = config.stations ? state.held : 0;

    if (sample.station && config.stations) {
      current.position.lerpVectors(_followPos, sample.camera.position, k);
      current.target.lerpVectors(_followTarget, sample.camera.target, k);
    } else {
      current.position.copy(_followPos);
      current.target.copy(_followTarget);
    }

    if (px !== 0 || py !== 0) {
      current.parallax.x = THREE.MathUtils.damp(
        current.parallax.x,
        frameState.pointer.x * px,
        config.damping.parallax,
        dt
      );
      current.parallax.y = THREE.MathUtils.damp(
        current.parallax.y,
        frameState.pointer.y * py,
        config.damping.parallax,
        dt
      );
    } else {
      current.parallax.x = 0;
      current.parallax.y = 0;
    }

    /**
     * Parallax goes into the TARGET, never onto the damped result.
     *
     * Adding it after the lerp feeds it back: the next frame damps from a
     * position that already contains it, so it accumulates until the damping
     * bleeds it off as fast as it arrives. Solving x = x(1-e) + Te + p gives
     * x = T + p/e — the offset amplified by 1/ease, around twelve times at
     * 60fps with a damping of 4.5.
     *
     * The amplification alone would only be too much parallax. What made it
     * SHAKE is that `ease` depends on frame time, so the resting position moved
     * on every slightly-longer frame — worst when the camera was otherwise
     * still, which is exactly what a station does. See test/camera.test.mjs.
     */
    _aim.copy(current.position);
    _aim.x += current.parallax.x;
    _aim.y += current.parallax.y;

    const ease = 1 - Math.exp(-(damping ?? config.damping.position) * dt);
    camera.position.lerp(_aim, ease);
    camera.lookAt(current.target);

    const fov = THREE.MathUtils.lerp(baseFov, sample.camera.fov, sample.station ? k : 0);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = THREE.MathUtils.damp(camera.fov, fov, config.damping.fov, dt);
      camera.updateProjectionMatrix();
    }
  }, -1);

  return children ?? null;
}
