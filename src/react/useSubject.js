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
const _euler = new THREE.Euler();
const _offset = new THREE.Quaternion();

const DEG = Math.PI / 180;

/**
 * Props are OVERRIDES, not the source of truth.
 *
 * How the subject carries itself lives in the document, so the editor can
 * change it and save it. Leaving these undefined — the normal case — uses the
 * document.
 */
export default function useSubject(ref, stage, options = {}) {
  const phase = useRef(0);

  useFrame((frameState, delta) => {
    const object = ref.current;
    if (!object || !stage) return;

    const dt = Math.min(delta, 1 / 30);
    const sample = stage.state.sample;

    const config = stage.journey.doc.subject;
    const damping = options.damping ?? config.damping;
    const bob = options.bob ?? config.bob;
    const heading = options.heading ?? config.heading;
    const headingDamping = options.headingDamping ?? config.headingDamping;
    const rotation = options.rotation ?? config.rotation;
    // A fixed subject does not drift. Idle motion on something the author
    // pinned in place is the opposite of what they asked for.
    const fixed = config.mode === "fixed";

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
    /**
     * A fixed subject is not blended toward a station's framing.
     *
     * The core already refuses to move it — but this recomputed the station
     * position independently, from `sample.subject`, which a fixed sample does
     * not write. The defaults are zeroes, so a fixed subject snapped to the
     * WORLD ORIGIN the moment any station took hold: parked correctly, then
     * gone the first time the reader reached a pin.
     *
     * Two places deciding where the subject goes is the same mistake as two
     * copies of the waypoint table. This defers to the sample.
     */
    if (!fixed && sample.station && stage.state.held > 0.001) {
      _stationPos.set(
        stage.journey.toWorldX(sample.subject.sx, sample.subject.z),
        sample.subject.y,
        sample.subject.z
      );
      _target.lerp(_stationPos, stage.state.held);
    }

    if (bob > 0 && !fixed) {
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

    /**
     * Base scale times the beats track.
     *
     * Two numbers because they answer different questions: `subject.scale` is
     * "what units was this file authored in", and the beats track is "how big
     * should it read right now". Folding them into one means re-tuning every
     * beat the day someone swaps in a model exported from a different package.
     */
    const scale = sample.station
      ? THREE.MathUtils.lerp(
          sample.beats.scale,
          sample.subject.scale ?? sample.beats.scale,
          stage.state.held
        )
      : sample.beats.scale;
    object.scale.setScalar(scale * (options.scale ?? config.scale ?? 1));

    /**
     * The model's own forward axis, as a correction after the heading.
     *
     * The heading logic aims local +Z along the direction of travel, and an
     * imported model is just as likely to have been built facing -Z or +X. That
     * is not a bug to fix in the heading — there is no way to guess a model's
     * forward axis — so it is authored, in degrees, and applied in the
     * subject's own frame.
     */
    const turned = rotation[0] !== 0 || rotation[1] !== 0 || rotation[2] !== 0;
    if (turned) {
      _euler.set(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG);
      _offset.setFromEuler(_euler);
    }

    if (heading && !fixed) {
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
        // Multiplied on the right, so the correction is in the subject's own
        // frame: "my nose is 90 degrees off", not "turn the world".
        if (turned) _quat.multiply(_offset);
        object.quaternion.slerp(_quat, 1 - Math.exp(-headingDamping * dt));
      }
    } else if (turned) {
      // With no heading to follow, the correction IS the orientation.
      object.quaternion.copy(_offset);
    }
  }, -10);
}
