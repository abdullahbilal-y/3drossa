"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/**
 * NASA's model of Cassini–Huygens, from NASA's 3D Resources:
 *   https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Cassini-Huygens%20(A)
 * NASA's 3D resources are free to use and carry no copyright; using them does
 * not imply NASA's endorsement of this page. Textures were re-encoded as WebP
 * at 1024 with gltf-transform (1.66 MB → 0.98 MB); the geometry is untouched.
 */
export const CASSINI_URL = `${process.env.NEXT_PUBLIC_BASE ?? ""}/models/cassini.glb`;

/**
 * The parts that make up the spacecraft's BODY, as named in the file.
 *
 * Fitting to the whole bounding box would size it by its 11 m magnetometer
 * boom and its radio antennas — thin lines four times the body's height — and
 * the craft itself would end up a speck. Fit to the body, and let the booms
 * reach out of frame the way they do in NASA's own renders.
 */
const BODY = ["dish", "foil_gold", "foil_gold_2"];

/** Height of the body in world units, before the document's subject scale. */
const SIZE = 0.85;

export default function Cassini() {
  const { scene } = useGLTF(CASSINI_URL);

  const object = useMemo(() => {
    const object = scene.clone(true);
    object.updateMatrixWorld(true);

    const body = new THREE.Box3();
    object.traverse((o) => {
      if (o.isMesh && BODY.includes(o.name)) body.expandByObject(o);
    });
    if (body.isEmpty()) body.setFromObject(object);

    const size = body.getSize(new THREE.Vector3());
    const scale = SIZE / size.y;
    const centre = body.getCenter(new THREE.Vector3());

    // Dish up (+Y, as modelled), magnetometer boom trailing along -Z — which
    // is the way useSubject points the craft, nose to the direction of travel.
    object.position.copy(centre).multiplyScalar(-scale);
    object.scale.setScalar(scale);
    return object;
  }, [scene]);

  return <primitive object={object} />;
}

useGLTF.preload(CASSINI_URL);
