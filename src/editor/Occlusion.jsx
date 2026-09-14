"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/**
 * The copy, drawn as the volume it actually occupies.
 *
 * This is the reason the editor belongs inside the host page rather than in a
 * studio of its own. A standalone editor can only draw an ABSTRACTION of the
 * layout — a single hardcoded "text column covers 79% of the frame" wedge —
 * and you author against that guess. Here the real text blocks are measured
 * from the live DOM and projected into the scene, so what you are steering
 * around is the actual headline at the actual size it is rendering right now.
 *
 * Each block is drawn as a frustum-aligned volume, not a flat rectangle,
 * because the constraint is three-dimensional: a block of copy shadows
 * everything behind it all the way back, and the volume narrows toward the
 * lens exactly as the visible width does. Seeing that shape is what makes the
 * whole reason `sx` exists obvious in a way the numbers never do.
 */

const DEFAULT_SELECTOR =
  "[data-rossa-copy], main h1, main h2, main h3, main p, [data-beat]";

/** Ignore anything too small or fully transparent to matter. */
const MIN_AREA = 2400;

function collectRects(selector) {
  if (typeof window === "undefined") return [];

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rects = [];

  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();

    // Off-screen blocks are not in the reader's frame, so they are not a
    // constraint on where the subject may fly right now.
    if (rect.bottom < 0 || rect.top > vh || rect.width * rect.height < MIN_AREA) {
      continue;
    }

    const opacity = Number(window.getComputedStyle(el).opacity);
    if (!(opacity > 0.05)) continue;

    rects.push({
      // Viewport fractions, origin at centre, y up — the space the lens works in.
      left: (rect.left / vw) * 2 - 1,
      right: (rect.right / vw) * 2 - 1,
      top: -((rect.top / vh) * 2 - 1),
      bottom: -((rect.bottom / vh) * 2 - 1),
      opacity,
    });
  }

  return rects;
}

/**
 * Build one frustum-aligned slab per visible block.
 *
 * The lens comes from the DOCUMENT, not from the live camera. That is
 * deliberate: `sx` is defined against the document's reference lens, so drawing
 * the keep-out volume against the same lens keeps the two consistent. Using the
 * live camera would make the volume drift and breathe as the camera eases and
 * parallaxes, which would be pretty and useless.
 */
function buildGeometry(rects, lens, near, far) {
  const positions = [];

  const cornersAt = (rect, depth) => {
    const halfWidth = lens.halfWidthAt(depth);
    const halfHeight = halfWidth / lens.aspect;
    return {
      lt: [rect.left * halfWidth, rect.top * halfHeight, depth],
      rt: [rect.right * halfWidth, rect.top * halfHeight, depth],
      rb: [rect.right * halfWidth, rect.bottom * halfHeight, depth],
      lb: [rect.left * halfWidth, rect.bottom * halfHeight, depth],
    };
  };

  for (const rect of rects) {
    const n = cornersAt(rect, near);
    const f = cornersAt(rect, far);

    const quad = (a, b, c, d) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);

    quad(f.lt, f.rt, f.rb, f.lb); // back
    quad(n.lt, n.rt, n.rb, n.lb); // front
    quad(f.lt, n.lt, n.lb, f.lb); // left
    quad(f.rt, f.rb, n.rb, n.rt); // right
    quad(f.lt, f.rt, n.rt, n.lt); // top
    quad(f.lb, n.lb, n.rb, f.rb); // bottom
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  );
  return geometry;
}

export default function Occlusion({
  stage,
  selector = DEFAULT_SELECTOR,
  near = 2.5,
  far = -12,
  color = "#e0483f",
  opacity = 0.14,
}) {
  const group = useRef(null);
  const geometry = useRef(null);
  const signature = useRef("");

  const lens = stage.journey.lens;
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [color, opacity]
  );

  const edges = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: Math.min(1, opacity * 3.2),
        depthWrite: false,
      }),
    [color, opacity]
  );

  useFrame(() => {
    if (!group.current) return;

    const rects = collectRects(selector);

    /**
     * Rebuild only when the layout actually changed.
     *
     * This runs every frame while the editor is open, and the page is being
     * scrubbed, so blocks enter and leave constantly. Rebuilding a buffer
     * geometry sixty times a second for an unchanged layout would make the
     * editor the slowest thing on the page — and a laggy editor gets blamed on
     * the engine.
     */
    const next = rects
      .map((r) => `${r.left.toFixed(3)},${r.right.toFixed(3)},${r.top.toFixed(3)},${r.bottom.toFixed(3)}`)
      .join("|");

    if (next === signature.current) return;
    signature.current = next;

    if (geometry.current) geometry.current.dispose();
    geometry.current = rects.length ? buildGeometry(rects, lens, near, far) : null;

    group.current.clear();
    if (geometry.current) {
      group.current.add(new THREE.Mesh(geometry.current, material));
      group.current.add(
        new THREE.LineSegments(new THREE.EdgesGeometry(geometry.current, 1), edges)
      );
    }
  });

  return <group ref={group} />;
}
