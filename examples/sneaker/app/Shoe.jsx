"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";

/**
 * The sneaker, from the Khronos glTF Sample Assets:
 *   "Materials Variants Shoe" © 2021 Shopify, CC BY 4.0
 *   https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/MaterialsVariantsShoe
 *
 * Textures were resized to 2048 and re-encoded as WebP (7.8 MB → 2.2 MB) with
 * `gltf-transform optimize --texture-compress webp --texture-size 2048`;
 * nothing else about the asset was changed.
 *
 * The file carries three colourways as KHR_materials_variants. three's loader
 * reads the extension but leaves choosing a variant to the app, so that is
 * what `useColourway` below does.
 */
export const SHOE_URL = `${process.env.NEXT_PUBLIC_BASE ?? ""}/models/shoe.glb`;

/** As named in the file, in the order the page presents them. */
export const COLOURWAYS = [
  { id: "midnight", label: "Midnight", swatch: "#1584b0" },
  { id: "beach", label: "Beach", swatch: "#e2b8b0" },
  { id: "street", label: "Street", swatch: "#2e2d2b" },
];

/**
 * Swap every mapped mesh to the material its variant names.
 *
 * Materials load lazily, so two quick choices can resolve out of order — a
 * scroll through the colourways asks for all three within a second. Each call
 * takes a ticket, and only the latest one is allowed to assign.
 */
let ticket = 0;
async function selectVariant(scene, parser, variants, name) {
  const mine = ++ticket;
  const index = variants.indexOf(name);
  const jobs = [];

  scene.traverse((object) => {
    const ext = object.isMesh && object.userData.gltfExtensions?.KHR_materials_variants;
    if (!ext) return;
    if (!object.userData.originalMaterial) object.userData.originalMaterial = object.material;

    const mapping = ext.mappings.find((m) => m.variants.includes(index));
    jobs.push(
      (mapping ? parser.getDependency("material", mapping.material) : Promise.resolve(null)).then(
        (material) => {
          if (mine !== ticket) return;
          object.material = material ?? object.userData.originalMaterial;
          parser.assignFinalMaterial(object);
        },
      ),
    );
  });

  await Promise.all(jobs);
}

export default function Shoe({ colourway = "midnight" }) {
  const gltf = useGLTF(SHOE_URL);

  const variants = useMemo(
    () => gltf.userData?.gltfExtensions?.KHR_materials_variants?.variants?.map((v) => v.name) ?? [],
    [gltf],
  );

  /**
   * Warm every colourway as soon as the shoe arrives. Each one is a material
   * with its own 2K texture to fetch and decode; left until the reader scrolls
   * into the colourways, the first switch lagged by a second or more and the
   * old colour sat under the new name.
   */
  useEffect(() => {
    gltf.scene.traverse((object) => {
      const ext = object.isMesh && object.userData.gltfExtensions?.KHR_materials_variants;
      ext?.mappings.forEach((m) => gltf.parser.getDependency("material", m.material));
    });
  }, [gltf]);

  useEffect(() => {
    if (variants.length) selectVariant(gltf.scene, gltf.parser, variants, colourway);
  }, [gltf, variants, colourway]);

  /**
   * The asset is modelled in metres — 30 cm long, toe toward +X, outer side
   * facing +Z, sole on y = 0. Scale it to the size the orbit in journey.json
   * was written for and put its middle on the origin, which is what the orbit
   * circles. Azimuth 0 is therefore the outer side, 90 the toe, -90 the heel.
   */
  return (
    <group scale={10.5}>
      <primitive object={gltf.scene} position={[-0.0016, -0.076, -0.0049]} />
    </group>
  );
}

useGLTF.preload(SHOE_URL);
