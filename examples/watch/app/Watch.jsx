"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/**
 * A field watch, built from primitives so the sample needs no asset pipeline.
 *
 * Dial faces +Z, crown sits on +X, the strap runs along Y and curls back
 * around an imaginary wrist. Those three axes are what the orbit in
 * journey.json is written against: azimuth 0 is the dial, 90 the crown,
 * 180 the exhibition caseback.
 *
 * The hands keep real time and the rotor swings, because a product page that
 * stops when you stop scrolling reads as a render, not a thing.
 */

const STEEL = { color: "#d4d1cb", metalness: 1, roughness: 0.32 };
const POLISHED = { color: "#e7e4de", metalness: 1, roughness: 0.12 };
const BRASS = { color: "#c49a5a", metalness: 1, roughness: 0.35 };
const GOLD = { color: "#d8b46a", metalness: 1, roughness: 0.22 };

/** Cylinders are built along Y; everything on this watch faces Z. */
const FACE_Z = [Math.PI / 2, 0, 0];

function Disc({ radius, depth, z, segments = 96, children, ...props }) {
  return (
    <mesh position={[0, 0, z]} rotation={FACE_Z} {...props}>
      <cylinderGeometry args={[radius, radius, depth, segments]} />
      {children}
    </mesh>
  );
}

/** A spur gear as an extruded outline: a hub, a rim and square-ish teeth. */
function useGear(radius, teeth) {
  return useMemo(() => {
    const shape = new THREE.Shape();
    const inner = radius * 0.86;
    const step = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      const points = [
        [inner, a],
        [radius, a + step * 0.15],
        [radius, a + step * 0.5],
        [inner, a + step * 0.65],
      ];
      for (const [r, t] of points) {
        const x = Math.cos(t) * r;
        const y = Math.sin(t) * r;
        if (i === 0 && r === inner && t === a) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
    }
    shape.closePath();

    /**
     * Flat, not extruded. ExtrudeGeometry silently produced no caps for this
     * outline — only the thin side walls rendered, which read as a scatter of
     * gold dashes. A wheel this thin needs no depth anyway.
     */
    const geometry = new THREE.ShapeGeometry(shape, 4);
    return geometry;
  }, [radius, teeth]);
}

function Gear({ radius, teeth, position, speed }) {
  const ref = useRef(null);
  const geometry = useGear(radius, teeth);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * speed;
  });
  return (
    <group ref={ref} position={position}>
      <mesh geometry={geometry}>
        <meshStandardMaterial {...GOLD} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={FACE_Z}>
        <cylinderGeometry args={[radius * 0.62, radius * 0.62, 0.02, 32]} />
        <meshStandardMaterial {...GOLD} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** A hand pivoting on the dial centre; `length` runs toward 12 o'clock. */
function Hand({ handRef, length, width, tail = 0, z, color, emissive }) {
  return (
    <group ref={handRef} position={[0, 0, z]}>
      <mesh position={[0, (length - tail) / 2, 0]}>
        <boxGeometry args={[width, length + tail, 0.012]} />
        <meshStandardMaterial
          color={color}
          metalness={0.3}
          roughness={0.4}
          emissive={emissive ?? "#000000"}
          emissiveIntensity={emissive ? 0.35 : 0}
        />
      </mesh>
    </group>
  );
}

function Strap() {
  /**
   * Two arcs of one cylinder, the wrist, centred behind the case.
   *
   * The arcs start at the lug tips and stop well short of meeting at the back,
   * so the caseback stays visible when the orbit comes round to it.
   */
  const { outer, inner } = useMemo(() => {
    const wristZ = -1.1;
    const lugY = 1.18;
    const radius = Math.hypot(lugY, wristZ);
    const start = Math.atan2(lugY, -wristZ); // angle of the top lug tip
    const reach = THREE.MathUtils.degToRad(74);

    const arc = (r, from, length) => {
      const g = new THREE.CylinderGeometry(r, r, 1.04, 64, 1, true, from, length);
      // Lay the cylinder's axis along X, so it wraps around the wrist.
      g.rotateZ(Math.PI / 2);
      g.translate(0, 0, wristZ);
      return g;
    };

    const both = (r) => [arc(r, start, reach), arc(r, -start - reach, reach)];
    return { outer: both(radius), inner: both(radius - 0.07) };
  }, []);

  return (
    <group>
      {outer.map((g, i) => (
        <mesh key={`o${i}`} geometry={g}>
          <meshStandardMaterial color="#6e4428" roughness={0.78} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {inner.map((g, i) => (
        <mesh key={`i${i}`} geometry={g}>
          <meshStandardMaterial color="#3b2416" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export default function Watch() {
  const hour = useRef(null);
  const minute = useRef(null);
  const second = useRef(null);
  const rotor = useRef(null);
  const balance = useRef(null);

  useFrame((state) => {
    const now = new Date();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    // Clockwise is negative about +Z.
    if (second.current) second.current.rotation.z = -(s / 60) * Math.PI * 2;
    if (minute.current) minute.current.rotation.z = -(m / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(h / 12) * Math.PI * 2;

    const t = state.clock.elapsedTime;
    if (rotor.current) rotor.current.rotation.z = Math.sin(t * 0.6) * 1.9;
    if (balance.current) balance.current.rotation.z = Math.sin(t * 18) * 1.4;
  });

  const indices = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return { a, double: i === 0, long: i % 3 === 0 };
      }),
    [],
  );

  const minuteTicks = useMemo(
    () => Array.from({ length: 60 }, (_, i) => (i / 60) * Math.PI * 2).filter((_, i) => i % 5 !== 0),
    [],
  );

  return (
    <group>
      {/* --- the case ---------------------------------------------------- */}
      {/* Open-ended, so the movement shows through the back. */}
      <mesh rotation={FACE_Z}>
        <cylinderGeometry args={[1, 1, 0.36, 96, 1, true]} />
        <meshStandardMaterial {...STEEL} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.18]}>
        <torusGeometry args={[0.965, 0.07, 24, 120]} />
        <meshStandardMaterial {...POLISHED} />
      </mesh>

      {/* Lugs, angled slightly down toward the wrist. */}
      {[-1, 1].map((sy) =>
        [-1, 1].map((sx) => (
          <mesh key={`${sx}${sy}`} position={[sx * 0.56, sy * 0.98, -0.03]} rotation={[sy * -0.25, 0, 0]}>
            <boxGeometry args={[0.15, 0.46, 0.22]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
        )),
      )}

      {/* Crown at 3 o'clock: knurled by giving it few, flat-shaded sides. */}
      <mesh position={[1.08, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.18, 22]} />
        <meshStandardMaterial {...STEEL} roughness={0.42} flatShading />
      </mesh>
      {/* The end of the crown carries the logo, polished flat. */}
      <mesh position={[1.172, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.006, 32]} />
        <meshStandardMaterial {...POLISHED} />
      </mesh>
      {[-1, 1].map((sy) => (
        <mesh key={sy} position={[1.06, sy * 0.18, 0]} rotation={[0, 0, sy * -0.35]}>
          <boxGeometry args={[0.12, 0.12, 0.2]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
      ))}
      <mesh position={[1.0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.1, 24]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>

      {/* --- the dial ---------------------------------------------------- */}
      <Disc radius={0.9} depth={0.02} z={0.17}>
        <meshStandardMaterial color="#1d3a32" roughness={0.55} metalness={0.25} />
      </Disc>
      {/* A slightly lighter centre, the way a sunray dial catches light. */}
      <Disc radius={0.58} depth={0.004} z={0.181}>
        <meshStandardMaterial color="#24463d" roughness={0.45} metalness={0.3} />
      </Disc>

      {indices.map(({ a, double, long }) => (
        <group key={a} rotation={[0, 0, -a]}>
          {(double ? [-0.035, 0.035] : [0]).map((dx) => (
            <mesh key={dx} position={[dx, long ? 0.7 : 0.73, 0.19]}>
              <boxGeometry args={[double ? 0.045 : long ? 0.06 : 0.045, long ? 0.2 : 0.13, 0.018]} />
              <meshStandardMaterial
                color="#efe6d2"
                emissive="#cfe8c4"
                emissiveIntensity={0.25}
                roughness={0.35}
              />
            </mesh>
          ))}
        </group>
      ))}
      {minuteTicks.map((a) => (
        <mesh key={a} position={[Math.sin(a) * 0.85, Math.cos(a) * 0.85, 0.185]} rotation={[0, 0, -a]}>
          <boxGeometry args={[0.012, 0.045, 0.006]} />
          <meshStandardMaterial color="#c9c2b2" />
        </mesh>
      ))}

      <Hand
        handRef={hour}
        length={0.44}
        width={0.07}
        tail={0.08}
        z={0.2}
        color="#efe6d2"
        emissive="#cfe8c4"
      />
      <Hand
        handRef={minute}
        length={0.68}
        width={0.05}
        tail={0.1}
        z={0.21}
        color="#efe6d2"
        emissive="#cfe8c4"
      />
      <Hand handRef={second} length={0.8} width={0.016} tail={0.2} z={0.22} color="#e2673a" />
      <Disc radius={0.04} depth={0.03} z={0.225} segments={24}>
        <meshStandardMaterial color="#e2673a" metalness={0.4} roughness={0.3} />
      </Disc>

      {/* Domed sapphire: almost invisible, except where it catches a light. */}
      <mesh position={[0, 0, 0.16]} scale={[1, 1, 0.16]}>
        <sphereGeometry args={[0.92, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.14}
          roughness={0}
          metalness={0}
          clearcoat={1}
          depthWrite={false}
        />
      </mesh>

      {/* --- the caseback and the movement behind it --------------------- */}
      <group position={[0, 0, -0.19]} rotation={[0, Math.PI, 0]}>
        <mesh>
          <torusGeometry args={[0.83, 0.06, 20, 100]} />
          <meshStandardMaterial {...POLISHED} />
        </mesh>
        {/* Movement plate: rhodium-plated, so the gold train reads against it. */}
        <Disc radius={0.95} depth={0.02} z={-0.09}>
          <meshStandardMaterial color="#b8b5ae" metalness={1} roughness={0.5} />
        </Disc>
        {/* A bridge: the bar that holds the wheels, with a polished edge. */}
        <mesh position={[-0.05, 0.02, -0.04]} rotation={[0, 0, 0.62]}>
          <boxGeometry args={[0.62, 0.09, 0.012]} />
          <meshStandardMaterial color="#9a978f" metalness={1} roughness={0.3} />
        </mesh>
        <Gear radius={0.17} teeth={22} position={[-0.22, 0.17, -0.06]} speed={0.6} />
        <Gear radius={0.11} teeth={14} position={[0.07, 0.3, -0.06]} speed={-0.95} />
        <Gear radius={0.1} teeth={12} position={[-0.13, -0.26, -0.06]} speed={1.4} />

        {/* Balance wheel: a ring that oscillates rather than turns. */}
        <group ref={balance} position={[0.24, -0.17, -0.06]}>
          <mesh>
            <torusGeometry args={[0.13, 0.016, 12, 48]} />
            <meshStandardMaterial {...GOLD} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.26, 0.018, 0.01]} />
            <meshStandardMaterial {...GOLD} />
          </mesh>
        </group>

        {/* Jewels. */}
        {[
          [-0.22, 0.17],
          [0.07, 0.3],
          [-0.13, -0.26],
          [0.24, -0.17],
          [0.3, 0.12],
        ].map(([x, y]) => (
          <mesh key={`${x}${y}`} position={[x, y, -0.035]}>
            <sphereGeometry args={[0.022, 16, 12]} />
            <meshStandardMaterial color="#b3123b" emissive="#5a0418" roughness={0.1} />
          </mesh>
        ))}

        {/*
          The rotor: a skeletonised half ring on one arm, so the train stays
          visible under it — a solid half disc hid everything it swung over.
        */}
        <group ref={rotor} position={[0, 0, -0.005]}>
          <mesh>
            <ringGeometry args={[0.5, 0.74, 64, 1, 0, Math.PI]} />
            <meshStandardMaterial {...GOLD} roughness={0.28} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <boxGeometry args={[0.08, 0.5, 0.015]} />
            <meshStandardMaterial {...GOLD} roughness={0.28} />
          </mesh>
          <Disc radius={0.07} depth={0.04} z={0} segments={32}>
            <meshStandardMaterial {...POLISHED} />
          </Disc>
        </group>

        {/* Exhibition glass. */}
        <Disc radius={0.82} depth={0.01} z={0.03}>
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={0.08}
            roughness={0}
            clearcoat={1}
            depthWrite={false}
          />
        </Disc>
      </group>

      <Strap />
    </group>
  );
}
