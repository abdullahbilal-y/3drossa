"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/**
 * Drives an object along the journey: position, scale, and heading.
 *
 * Whatever the subject is — a glTF creature, a product, a camera-facing card —
 * this is the only hook it needs. It writes to the ref directly inside the
 * render loop, so nothing about the subject moving ever reaches React.
 */

const _target = new THREE.Vector3();
const _stationPos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);

export default function useSubject(
  ref,
  stage,
  {
    damping = 9,
    /** Idle motion, so a parked reader still sees something alive. */
    bob = 1,
    /** Turn toward the direction of travel. */
    heading = true,
    headingDamping = 3,
  } = {}
) {
  const phase = useRef(0);

  useFrame((frameState, delta) => {
    const object = ref.current;
    if (!object || !stage) return;

    const dt = Math.min(delta, 1 / 30);
    const sample = stage.state.sample;

    /**
     * Phase is ACCUMULATED, never `elapsed * frequency`.
     *
     * With `elapsed * freq`, changing the frequency rewrites the whole history
     * of the phase — so any wobble that reacts to scroll velocity jumps every
     * time the reader speeds up or slows down. Integrating it instead means
     * the past stays where it was.
     */
    phase.current += dt;
    const t = phase.current;

    _target.copy(sample.travel);

    /**
     * While a station is held, the subject plays to that station's framing
     * rather than continuing to travel through it. Blended, so the transition
     * into a pin is a move rather than a switch.
     */
    if (sample.station && stage.state.held > 0.001) {
      _stationPos.set(
        stage.journey.toWorldX(sample.subject.sx, sample.subject.z),
        sample.subject.y,
        sample.subject.z
      );
      _target.lerp(_stationPos, stage.state.held);
    }

    if (bob > 0) {
      /**
       * Summed sines at deliberately unrelated frequencies. Because the ratios
       * are irrational the pattern never repeats, which is what reads as
       * something alive rather than as an object on a loop.
       */
      const calm =
        1 - THREE.MathUtils.clamp(Math.abs(stage.state.velocity) / 1400, 0, 1);
      const amount = bob * (0.55 + 0.75 * calm);

      _target.x += (Math.sin(t * 0.83) * 0.07 + Math.sin(t * 1.97 + 2.1) * 0.025) * amount;
      _target.y +=
        (Math.sin(t * 1.31 + 1.1) * 0.085 + Math.sin(t * 2.71 + 0.4) * 0.035) * amount;
    }

    object.position.lerp(_target, 1 - Math.exp(-damping * dt));

    const scale = sample.station
      ? THREE.MathUtils.lerp(
          sample.beats.scale,
          sample.subject.scale ?? sample.beats.scale,
          stage.state.held
        )
      : sample.beats.scale;
    object.scale.setScalar(scale);

    if (heading) {
      _look.copy(sample.heading);

      /**
       * Built as a camera-style basis and SLERPED, never assigned.
       *
       * Object3D.lookAt builds its matrix as lookAt(target, position) — the
       * arguments are swapped relative to a camera — so a mesh pointed with it
       * ends up with its local +Z facing the target, which reads as flying
       * backwards. Composing the basis explicitly and easing into it means the
       * heading can never snap, and never flips through upside-down.
       */
      if (_look.distanceToSquared(object.position) > 1e-6) {
        _matrix.lookAt(_look, object.position, _up);
        _quat.setFromRotationMatrix(_matrix);
        object.quaternion.slerp(_quat, 1 - Math.exp(-headingDamping * dt));
      }
    }
  }, -10);
}
