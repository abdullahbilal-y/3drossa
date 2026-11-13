"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { sampleTrack } from "3drossa";
import {
  cloudTexture,
  earthTexture,
  glowTexture,
  jupiterTexture,
  marsTexture,
  moonTexture,
  ringTexture,
  saturnTexture,
} from "./textures.js";

/**
 * The solar system, as keyframes bound to page progress.
 *
 * Travel is sold by the world streaming past, not by flying the camera through
 * it: the lens stays near the document's viewpoint, so the probe's screen-space
 * path keeps meaning what it says, and the planets come to it. Each body is a
 * track in exactly the format journey.json uses — `p` plus channels — and is
 * sampled with the engine's own `sampleTrack`. Nothing here is special-cased;
 * it is the same "everything is keyframes" idea, applied by the host.
 *
 * The p values line up with the stations in journey.json: launch 0.082–0.246,
 * the Jupiter flyby 0.410–0.574, arrival at Saturn 0.738–0.918.
 */
const S = "smoothstep";

const TRACKS = {
  earth: [
    { p: 0, position: [3.7, -3.4, -3], spin: 0, ease: S },
    { p: 0.082, position: [3.9, -3.7, -3.6], spin: 0.4, ease: S },
    { p: 0.246, position: [5.6, -6.2, -11], spin: 1.6 },
    { p: 0.36, position: [16, -24, -48], spin: 2 },
  ],
  moon: [
    { p: 0, position: [5.4, 2.6, -12], ease: S },
    { p: 0.246, position: [7, 3.4, -20] },
    { p: 0.36, position: [22, 14, -70] },
  ],
  mars: [
    { p: 0.16, position: [3, 4, -260], ease: S },
    { p: 0.3279, position: [4.4, 2.2, -15], ease: S },
    { p: 0.42, position: [11, 4.5, -2] },
  ],
  jupiter: [
    { p: 0.26, position: [9, 1.5, -380], spin: 0, ease: S },
    { p: 0.4098, position: [6.4, 0.7, -13], spin: 0.6, ease: S },
    { p: 0.5738, position: [5.4, -0.6, -9.5], spin: 1.4, ease: S },
    { p: 0.68, position: [18, -3, 2], spin: 1.8 },
  ],
  saturn: [
    { p: 0.58, position: [12, 5, -420], spin: 0, ease: S },
    { p: 0.7377, position: [5, 1.4, -12.5], spin: 0.4, ease: S },
    { p: 0.918, position: [4.2, 0.8, -8.6], spin: 1.2, ease: S },
    { p: 1, position: [3.9, 0.7, -8], spin: 1.4 },
  ],
};

/**
 * A glow just outside the limb of a planet with air.
 *
 * Drawn on the BACK faces of a slightly larger shell, brightest where the
 * shell meets the planet's edge and fading to nothing at its own. A front-face
 * fresnel was tried first and drew a bright ring standing off the planet with
 * a gap of black between them — a halo, not an atmosphere.
 */
function Atmosphere({ radius, color, strength = 1, thickness = 1.08 }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-view.xyz);
            gl_Position = projectionMatrix * view;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 color;
          uniform float strength;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            // 0 at the shell's silhouette, rising toward the planet's limb.
            float k = smoothstep(0.0, 0.42, -dot(vNormal, vView));
            gl_FragColor = vec4(color, pow(k, 1.6) * strength);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    [color, strength],
  );
  return (
    <mesh material={material} scale={thickness}>
      <sphereGeometry args={[radius, 64, 32]} />
    </mesh>
  );
}

/** One body, placed every frame from its track. */
function Body({ stage, track, children, tilt = 0 }) {
  const group = useRef(null);
  const spin = useRef(null);
  const out = useMemo(() => ({}), []);

  useFrame(() => {
    if (!group.current) return;
    sampleTrack(track, stage.state.progress, out, "p");
    if (out.position) group.current.position.fromArray(out.position);
    if (spin.current && out.spin !== undefined) spin.current.rotation.y = out.spin;
  });

  return (
    <group ref={group}>
      <group rotation={[0, 0, tilt]}>
        <group ref={spin}>{children}</group>
      </group>
    </group>
  );
}

function Earth({ stage }) {
  const surface = useMemo(earthTexture, []);
  const clouds = useMemo(cloudTexture, []);
  const cloudRef = useRef(null);
  useFrame((_, delta) => {
    if (cloudRef.current) cloudRef.current.rotation.y += delta * 0.01;
  });
  return (
    <Body stage={stage} track={TRACKS.earth} tilt={0.41}>
      <mesh>
        <sphereGeometry args={[2.6, 96, 48]} />
        <meshStandardMaterial map={surface} roughness={0.85} metalness={0} />
      </mesh>
      <mesh ref={cloudRef} scale={1.012}>
        <sphereGeometry args={[2.6, 96, 48]} />
        <meshStandardMaterial map={clouds} transparent depthWrite={false} roughness={1} />
      </mesh>
      <Atmosphere radius={2.6} color="#5fb4ff" strength={1.1} thickness={1.07} />
    </Body>
  );
}

function Moon({ stage }) {
  const surface = useMemo(moonTexture, []);
  return (
    <Body stage={stage} track={TRACKS.moon}>
      <mesh>
        <sphereGeometry args={[0.55, 48, 24]} />
        <meshStandardMaterial map={surface} roughness={1} />
      </mesh>
    </Body>
  );
}

function Mars({ stage }) {
  const surface = useMemo(marsTexture, []);
  return (
    <Body stage={stage} track={TRACKS.mars} tilt={0.44}>
      <mesh>
        <sphereGeometry args={[0.8, 64, 32]} />
        <meshStandardMaterial map={surface} roughness={0.95} />
      </mesh>
      <Atmosphere radius={0.8} color="#ff9a6a" strength={0.5} />
    </Body>
  );
}

function Jupiter({ stage }) {
  const surface = useMemo(jupiterTexture, []);
  return (
    <Body stage={stage} track={TRACKS.jupiter} tilt={0.05}>
      <mesh>
        <sphereGeometry args={[4.4, 128, 64]} />
        <meshStandardMaterial map={surface} roughness={0.9} />
      </mesh>
      <Atmosphere radius={4.4} color="#ffd9a8" strength={0.35} thickness={1.05} />
    </Body>
  );
}

function Saturn({ stage }) {
  const surface = useMemo(saturnTexture, []);
  const rings = useMemo(ringTexture, []);
  const radius = 2.3;
  return (
    <Body stage={stage} track={TRACKS.saturn} tilt={0.47}>
      <mesh>
        <sphereGeometry args={[radius, 96, 48]} />
        <meshStandardMaterial map={surface} roughness={0.9} />
      </mesh>
      {/* Inner/outer must match the 0.45 the ring texture was painted at. */}
      <mesh rotation={[-Math.PI / 2 + 0.12, 0, 0]}>
        <ringGeometry args={[radius * 2.4 * 0.45, radius * 2.4, 192, 1]} />
        <meshStandardMaterial
          map={rings}
          transparent
          side={THREE.DoubleSide}
          roughness={1}
          depthWrite={false}
        />
      </mesh>
      <Atmosphere radius={radius} color="#ffe6b0" strength={0.3} thickness={1.05} />
    </Body>
  );
}

/**
 * Dust that streams toward the lens as you scroll.
 *
 * Bound to progress, not time, so stopping scrolling stops the voyage — and
 * scrolling back flies it backwards.
 */
function Dust({ stage, count = 700 }) {
  const ref = useRef(null);
  const { base, positions } = useMemo(() => {
    const base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base[i * 3] = (Math.random() - 0.5) * 34;
      base[i * 3 + 1] = (Math.random() - 0.5) * 22;
      base[i * 3 + 2] = -Math.random() * 70;
    }
    return { base, positions: base.slice() };
  }, [count]);

  useFrame(() => {
    const points = ref.current;
    if (!points) return;
    const shift = stage.state.progress * 520;
    for (let i = 0; i < count; i++) {
      const z = base[i * 3 + 2] + shift;
      positions[i * 3 + 2] = ((((z + 70) % 76) + 76) % 76) - 70;
    }
    points.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#cfd8ff"
        size={0.05}
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </points>
  );
}

function Sun() {
  const glow = useMemo(() => glowTexture(), []);
  return (
    <sprite position={[-52, 26, -90]} scale={[30, 30, 1]}>
      <spriteMaterial map={glow} blending={THREE.AdditiveBlending} depthWrite={false} transparent />
    </sprite>
  );
}

export default function Scenery({ stage }) {
  return (
    <>
      <Stars radius={120} depth={60} count={5000} factor={3.2} saturation={0} fade speed={0.4} />
      <Sun />
      <Dust stage={stage} />
      <Earth stage={stage} />
      <Moon stage={stage} />
      <Mars stage={stage} />
      <Jupiter stage={stage} />
      <Saturn stage={stage} />
    </>
  );
}
