"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import useSubject from "./useSubject.js";
import useDocument from "./useDocument.js";

/**
 * The model the journey drives, loaded from the document.
 *
 * `<Subject stage={stage} />` and you are done: the path, the scale, the
 * heading and the FILE all come from `journey.json`. That last one is the point
 * — dropping a model on the page writes it into the repository and records the
 * path here, so nobody has to go and edit a component afterwards to see it.
 *
 * Pass children to render your own thing instead; the hook drives whatever is
 * inside. This component is a convenience, not a requirement — `useSubject` on
 * a ref of your own has always been the underlying API and still is.
 */

/** Normalise a model so an arbitrary export reads at a usable size. */
function fit(scene, size) {
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
   * recentring, the journey drives the model's ORIGIN and the model itself
   * orbits somewhere off screen, which reads as "3drossa ignored my model"
   * rather than as "your model's origin is not where you think".
   */
  object.position.sub(box.getCenter(new THREE.Vector3()));

  const wrapper = new THREE.Group();
  wrapper.add(object);
  wrapper.scale.setScalar(size / largest);
  return wrapper;
}

function Model({ url, size }) {
  const gltf = useLoader(GLTFLoader, url);
  const fitted = useMemo(() => fit(gltf.scene, size), [gltf, size]);

  // useLoader caches by URL. A page that lets you try several models would
  // otherwise hold every one of them for the life of the tab.
  useEffect(() => () => useLoader.clear(GLTFLoader, url), [url]);

  return <primitive object={fitted} />;
}

export default function Subject({
  stage,
  children,
  /**
   * The size the longest side of an imported model is normalised to.
   *
   * Separate from `subject.scale` in the document, which is the author's
   * adjustment on top. This one exists so that a model arriving in millimetres
   * and a model arriving in metres both show up on screen at all — without it,
   * the first thing you see after dropping a file is either nothing or a wall.
   */
  fitTo = 1.6,
  options,
}) {
  const ref = useRef(null);
  useSubject(ref, stage, options);

  // Without this a model dropped on the page was written to disk and recorded
  // in the document while the page went on rendering the previous one.
  const doc = useDocument(stage);
  const url = doc?.subject.model ?? null;

  return (
    <group ref={ref} name="rossa-subject">
      {/* Whatever the host rendered stands in while a model loads, so the path
          is never briefly empty. */}
      <Suspense fallback={children ?? null}>
        {url ? <Model url={url} size={fitTo} /> : children}
      </Suspense>
    </group>
  );
}
