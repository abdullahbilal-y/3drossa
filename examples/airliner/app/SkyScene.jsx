"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer, Sky } from "@react-three/drei";

/**
 * Afternoon sky, built in the scene: drei's atmospheric Sky shader, a soft
 * studio environment for the fuselage to reflect, and clouds painted on a
 * canvas at load. No image files and nothing fetched from a CDN at runtime.
 *
 * The sun sits behind the camera and to the right, so an aircraft flying AT
 * the lens is lit on its nose and wing roots rather than arriving as a
 * silhouette.
 */
export const SUN = new THREE.Vector3(0.55, 0.22, 1).normalize();

/** One soft cloud: a cluster of overlapping radial puffs on a transparent square. */
function cloudTexture(seed) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

  for (let i = 0; i < 22; i++) {
    const x = size * (0.2 + rand() * 0.6);
    const y = size * (0.42 + (rand() - 0.5) * 0.28);
    const r = size * (0.08 + rand() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = 236 + Math.round(rand() * 19);
    g.addColorStop(0, `rgba(${shade},${shade},${shade + 2},0.55)`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Clouds({ count = 46 }) {
  const textures = useMemo(() => [1, 2, 3, 4].map(cloudTexture), []);
  const group = useRef(null);

  const clouds = useMemo(() => {
    let s = 7;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: count }, (_, i) => {
      // Most of them in a deck well below the flight path, a few higher up.
      const high = i % 5 === 0;
      const z = -12 - rand() * 170;
      return {
        position: [(rand() - 0.5) * (40 + -z * 1.2), high ? 4 + rand() * 6 : -6 - rand() * 5, z],
        scale: (high ? 10 : 16) + rand() * 18,
        texture: i % 4,
        opacity: high ? 0.55 : 0.85,
      };
    });
  }, [count]);

  // A slow drift, so a still page still breathes.
  useFrame((_, delta) => {
    if (group.current) group.current.position.x += delta * 0.05;
  });

  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <sprite key={i} position={c.position} scale={[c.scale, c.scale * 0.5, 1]}>
          <spriteMaterial map={textures[c.texture]} transparent depthWrite={false} opacity={c.opacity} />
        </sprite>
      ))}
    </group>
  );
}

export default function SkyScene() {
  const sunPosition = useMemo(() => SUN.clone().multiplyScalar(1000).toArray(), []);
  return (
    <>
      <Sky
        distance={4500}
        sunPosition={sunPosition}
        turbidity={6}
        rayleigh={1.4}
        mieCoefficient={0.004}
        mieDirectionalG={0.85}
      />
      <fog attach="fog" args={["#cdd9e6", 40, 260]} />

      <hemisphereLight args={["#dfeaff", "#8a95a3", 0.9]} />
      <directionalLight position={SUN.clone().multiplyScalar(20).toArray()} intensity={2.4} color="#fff1df" />

      {/* What the fuselage reflects: a bright sky above, a darker cloud deck below. */}
      <Environment resolution={128} frames={1}>
        <color attach="background" args={["#a9bfd6"]} />
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} color="#eaf2ff" />
        <Lightformer form="rect" intensity={0.6} position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} color="#8d98a6" />
        <Lightformer form="circle" intensity={4} position={SUN.clone().multiplyScalar(8).toArray()} scale={2.5} color="#fff0d8" />
      </Environment>

      <Clouds />
    </>
  );
}
