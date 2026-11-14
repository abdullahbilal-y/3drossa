"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/**
 * The airliner: amvlab's logo-free A380 from "amvlab 3D Aircraft Models",
 *   https://github.com/amvlab/aircraft-models — models/A380_nologo.glb
 *   © 2026 amvlab, CC BY 4.0. Used unmodified.
 *
 * The page names no airline and carries no manufacturer's marks; the tail's
 * blue is the model's own plain livery.
 */
export const AIRLINER_URL = `${process.env.NEXT_PUBLIC_BASE ?? ""}/models/a380.glb`;

/** Nose to tail, in world units, before the document's subject scale. */
const LENGTH = 2.6;

export default function Airliner() {
  const { scene } = useGLTF(AIRLINER_URL);

  const object = useMemo(() => {
    const model = scene.clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());

    // Modelled nose toward +X, fin up. useSubject points +Z along the
    // direction of travel, so turn the nose onto +Z, and put the middle of the
    // aircraft on the subject's origin so it pivots about itself, not a wingtip.
    const scale = LENGTH / size.x;
    model.position.copy(centre).multiplyScalar(-scale);
    model.scale.setScalar(scale);

    model.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.envMapIntensity = 1.1;
      }
    });

    const turned = new THREE.Group();
    turned.rotation.y = -Math.PI / 2;
    turned.add(model);
    return turned;
  }, [scene]);

  return <primitive object={object} />;
}

useGLTF.preload(AIRLINER_URL);
