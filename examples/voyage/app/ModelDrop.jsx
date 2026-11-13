"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/**
 * Drop a .glb on the page and preview it in place of the built-in subject.
 *
 * Two different things happen depending on where the page is running:
 *
 *   - with the editor open and a save route (`npm run dev`), the EDITOR takes
 *     the drop: the file is written into public/models and the document
 *     records it, so it survives a reload and a fresh clone;
 *   - anywhere else — the static build, or the editor closed — the file is
 *     read locally into an object URL and lasts until the tab is reloaded.
 *
 * The page decides which, up front, from whether the editor can write. It
 * does not try to infer it from the event: listener order between the page
 * and the editor is not something to lean on.
 */
export function useModelDrop({ editorWrites }) {
  const [model, setModel] = useState(null);
  const [notice, setNotice] = useState(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const hasFiles = (event) => !!event.dataTransfer?.types?.includes("Files");

    const onOver = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setOver(true);
    };
    const onLeave = (event) => {
      if (event.relatedTarget === null) setOver(false);
    };
    const onDrop = (event) => {
      if (!hasFiles(event)) return;
      // Unhandled, the browser navigates to the file and the page is gone.
      event.preventDefault();
      setOver(false);
      if (editorWrites) return;

      const files = [...(event.dataTransfer?.files || [])];
      const file = files.find((f) => /\.glb$/i.test(f.name));
      if (!file) {
        const name = files[0]?.name ?? "That file";
        setNotice(
          /\.gltf$/i.test(name)
            ? `${name} needs its .bin and textures beside it. Export as .glb instead.`
            : `${name} is not a .glb. Export from Blender as glTF Binary (.glb).`,
        );
        return;
      }

      setNotice(null);
      setModel((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return { url: URL.createObjectURL(file), name: file.name };
      });
    };

    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [editorWrites]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const reset = () =>
    setModel((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });

  return { model, notice, over, reset };
}

/** A dropped model, centred on its own bounds and scaled to `size`. */
function Fitted({ url, size }) {
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
    wrapper.scale.setScalar(size / largest);
    return wrapper;
  }, [scene, size]);

  useEffect(() => () => useGLTF.clear(url), [url]);

  return <primitive object={fitted} />;
}

/** Renders the dropped model when there is one, otherwise `children`. */
export function DroppedOr({ url, size = 2.4, children }) {
  return <Suspense fallback={children}>{url ? <Fitted url={url} size={size} /> : children}</Suspense>;
}

/** The badge and the full-page drop cue, shared by both states. */
export function DropBadge({ model, notice, reset, idle, tone = "dark" }) {
  const base =
    tone === "dark"
      ? "border-white/15 bg-black/50 text-white/70"
      : "border-black/10 bg-white/70 text-black/60";
  return (
    <span className={`rounded border px-3 py-1.5 text-xs backdrop-blur ${base}`}>
      {notice ? (
        <span className="text-[#d0492f]">{notice}</span>
      ) : model ? (
        <>
          {model.name}
          <span className="ml-2 opacity-60">preview · lasts until reload</span>
          <button onClick={reset} className="ml-2 underline">
            reset
          </button>
        </>
      ) : (
        idle
      )}
    </span>
  );
}

export function DropCue({ over, label }) {
  if (!over) return null;
  return (
    <div className="pointer-events-none fixed inset-4 z-[2147483003] flex items-center justify-center rounded-xl border-2 border-dashed border-current/40 bg-black/30 text-sm text-white backdrop-blur-sm">
      {label}
    </div>
  );
}
