"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useSubject } from "3drossa/react";
import { planeGeometry } from "./Plane.jsx";

/**
 * The thing that flies the path — the built-in paper plane, or yours.
 *
 * The engine has no opinion about what the subject is: `useSubject(ref, stage)`
 * drives whatever you render, and always has. The drop target exists because
 * the PLAYGROUND had one hardcoded shape, so the most obvious question anyone
 * asks of a path tool — "does it move MY model?" — could only be answered by
 * cloning the repo.
 *
 * The file never leaves the browser. It is read into an object URL and parsed
 * by three's own loader; nothing is uploaded anywhere.
 */

/** Normalise a dropped model so it reads at the same size as the built-in one. */
function fit(scene, size = 1.6) {
  const object = scene.clone(true);

  const box = new THREE.Box3().setFromObject(object);
  const span = box.getSize(new THREE.Vector3());
  const largest = Math.max(span.x, span.y, span.z);
  if (!(largest > 0)) return object;

  /**
   * Centre it on its own bounding box before scaling.
   *
   * Exported models are authored around wildly different origins — feet on the
   * ground, or a hundred units off in the scene they were staged in. Without
   * recentring, the path drives the model's ORIGIN and the model itself orbits
   * somewhere off screen, which reads as "3drossa ignored my model" rather than
   * as "your model's origin is not where you think".
   */
  const centre = box.getCenter(new THREE.Vector3());
  object.position.sub(centre);

  const wrapper = new THREE.Group();
  wrapper.add(object);
  wrapper.scale.setScalar(size / largest);
  return wrapper;
}

function Loaded({ url }) {
  const { scene } = useGLTF(url);
  const fitted = useMemo(() => fit(scene), [scene]);

  // drei caches by URL, and every drop makes a new object URL — without this
  // the whole of every model you tried stays in memory for the session.
  useEffect(() => () => useGLTF.clear(url), [url]);

  return <primitive object={fitted} />;
}

function Builtin() {
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

export default function Subject({ stage, url }) {
  const ref = useRef(null);
  useSubject(ref, stage);

  return (
    <group ref={ref}>
      {/* The built-in plane stands in while a model is being parsed, so the
          path is never briefly empty. */}
      <Suspense fallback={<Builtin />}>
        {url ? <Loaded url={url} /> : <Builtin />}
      </Suspense>
    </group>
  );
}
