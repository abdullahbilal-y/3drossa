"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The stage's current document, re-read when the editor replaces it.
 *
 * `stage` keeps its identity across a rebuild. That is deliberate — it is what
 * makes editing cost zero reconciliations, because the render loop reads
 * `stage.journey` fresh every frame and React never hears about any of it.
 *
 * The cost is that anything reading the document during RENDER has no way to
 * notice a change. Two components did, and both were quietly broken by it: a
 * model named in the document loaded once and never reloaded, and a station's
 * length and placement were read on mount and then frozen — so editing "holds
 * for" appeared to do nothing until the page was reloaded.
 *
 * One hook, so the next component to read the document during render gets it
 * right by default.
 */
export default function useDocument(stage) {
  const subscribe = useCallback(
    (listener) => (stage?.subscribe ? stage.subscribe(listener) : () => {}),
    [stage]
  );
  const snapshot = useCallback(() => (stage?.getVersion ? stage.getVersion() : 0), [stage]);

  useSyncExternalStore(subscribe, snapshot, snapshot);

  return stage?.journey.doc ?? null;
}
