"use client";

import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/**
 * What the demo flies when the document names no model.
 *
 * A folded paper plane, chosen because it has an unambiguous nose. The heading
 * logic in useSubject is the easiest thing in the engine to get subtly wrong —
 * a mesh pointed with Object3D.lookAt ends up flying tail-first — and a
 * symmetrical blob would hide that.
 *
 * Built nose-forward along +Z, because that is the axis useSubject aims.
 */
function planeGeometry() {
  const nose = [0, 0, 1.0];
  const tail = [0, 0, -0.55];
  const left = [-0.62, 0, -0.42];
  const right = [0.62, 0, -0.42];
  const keelBack = [0, -0.22, -0.5];

  const tri = (...points) => points.flat();

  const vertices = new Float32Array([
    // The two upper wings.
    ...tri(nose, left, tail),
    ...tri(nose, tail, right),
    // The keel underneath, which gives it a readable roll.
    ...tri(nose, keelBack, left),
    ...tri(nose, right, keelBack),
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function Paper() {
  const geometry = useMemo(planeGeometry, []);

  return (
    <>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#f6f1e8"
          roughness={0.55}
          metalness={0.05}
          side={THREE.DoubleSide}
          flatShading
        />
      </mesh>
      {/* A faint underside tint so the roll reads against a dark ground. */}
      <mesh geometry={geometry} scale={0.999} position={[0, -0.012, 0]}>
        <meshBasicMaterial color="#c4a77d" side={THREE.BackSide} transparent opacity={0.5} />
      </mesh>
    </>
  );
}

/** A model dropped on the static playground, where there is nowhere to save it. */
function Preview({ url }) {
  const { scene } = useGLTF(url);

  const fitted = useMemo(() => {
    const object = scene.clone(true);
    const box = new THREE.Box3().setFromObject(object);
    const span = box.getSize(new THREE.Vector3());
    const largest = Math.max(span.x, span.y, span.z);
    if (!(largest > 0)) return object;

    object.position.sub(box.getCenter(new THREE.Vector3()));
    const wrapper = new THREE.Group();
    wrapper.add(object);
    wrapper.scale.setScalar(1.6 / largest);
    return wrapper;
  }, [scene]);

  useEffect(() => () => useGLTF.clear(url), [url]);

  return <primitive object={fitted} />;
}

export default function Plane({ url }) {
  return (
    <Suspense fallback={<Paper />}>{url ? <Preview url={url} /> : <Paper />}</Suspense>
  );
}
