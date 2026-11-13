"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/**
 * The probe, built nose-forward along +Z — the axis useSubject aims at the
 * direction of travel. The dish rides on top, the engine is at the back, and
 * its plume answers how fast the reader is scrolling.
 */

const FOIL = { color: "#e2b552", metalness: 0.75, roughness: 0.32 };
const WHITE = { color: "#e9e7e1", metalness: 0.1, roughness: 0.55 };
const DARK = { color: "#2b2d31", metalness: 0.6, roughness: 0.5 };

function Dish() {
  // A paraboloid, opening along +Y once lathed.
  const geometry = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 16; i++) {
      const r = (i / 16) * 0.62;
      points.push(new THREE.Vector2(r, r * r * 0.55));
    }
    return new THREE.LatheGeometry(points, 64);
  }, []);

  return (
    <group position={[0, 0.3, -0.05]} rotation={[-0.35, 0, 0]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial {...WHITE} side={THREE.DoubleSide} />
      </mesh>
      {/* The feed, held at the focus on three thin struts. */}
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 0.08, 12]} />
        <meshStandardMaterial {...DARK} />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.22, 0.2, Math.sin(a) * 0.22]}
            rotation={[Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55]}
          >
            <cylinderGeometry args={[0.006, 0.006, 0.36, 6]} />
            <meshStandardMaterial {...DARK} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function Probe({ stage }) {
  const plume = useRef(null);
  const glow = useRef(0);

  useFrame((_, delta) => {
    // Damped, so a flick of the wheel is a burn rather than a flicker.
    const speed = Math.min(1, Math.abs(stage?.state.velocity ?? 0) / 2400);
    glow.current = THREE.MathUtils.damp(glow.current, speed, 5, Math.min(delta, 1 / 30));
    if (plume.current) {
      const length = 0.4 + glow.current * 2.2;
      plume.current.scale.set(1, length, 1);
      // Grow away from the nozzle, not about the cone's middle.
      plume.current.position.y = 0.25 * length;
      plume.current.material.opacity = 0.15 + glow.current * 0.75;
    }
  });

  return (
    <group scale={0.62}>
      {/* The bus, wrapped in foil. */}
      <mesh>
        <boxGeometry args={[0.5, 0.42, 0.62]} />
        <meshStandardMaterial {...FOIL} />
      </mesh>
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[0.52, 0.06, 0.64]} />
        <meshStandardMaterial {...DARK} />
      </mesh>

      <Dish />

      {/* RTG on a boom to the right: a finned cylinder, kept away from the instruments. */}
      <mesh position={[0.55, 0, -0.05]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.6, 6]} />
        <meshStandardMaterial {...DARK} />
      </mesh>
      <group position={[0.9, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.07, 0.07, 0.42, 16]} />
          <meshStandardMaterial {...DARK} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} rotation={[0, (i / 6) * Math.PI, 0]}>
            <boxGeometry args={[0.24, 0.38, 0.01]} />
            <meshStandardMaterial {...DARK} />
          </mesh>
        ))}
      </group>

      {/* Magnetometer: a long, thin boom to the left with a sensor at the tip. */}
      <mesh position={[-0.95, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 1.4, 6]} />
        <meshStandardMaterial {...WHITE} />
      </mesh>
      <mesh position={[-1.66, 0.05, 0]}>
        <boxGeometry args={[0.07, 0.07, 0.07]} />
        <meshStandardMaterial {...WHITE} />
      </mesh>

      {/* Main engine at the back, and its plume. */}
      <mesh position={[0, 0, -0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.05, 0.14, 20, 1, true]} />
        <meshStandardMaterial {...DARK} side={THREE.DoubleSide} />
      </mesh>
      <group position={[0, 0, -0.47]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh ref={plume} position={[0, 0.25, 0]}>
          <coneGeometry args={[0.09, 0.5, 20, 1, true]} />
          <meshBasicMaterial
            color="#ffb35c"
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}
