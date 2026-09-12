import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

export type ClothStyle = "none" | "peasant" | "ranger";
export type ClothSlot = "head" | "body" | "arms" | "legs" | "feet" | "extra";

export type Loadout = Record<ClothSlot, ClothStyle>;

export const CLOTH_SLOTS: { id: ClothSlot; label: string; options: ClothStyle[] }[] = [
  { id: "head", label: "Head", options: ["none", "ranger"] },
  { id: "body", label: "Body", options: ["peasant", "ranger"] },
  { id: "arms", label: "Arms", options: ["peasant", "ranger"] },
  { id: "legs", label: "Legs", options: ["peasant", "ranger"] },
  { id: "feet", label: "Feet", options: ["peasant", "ranger"] },
  { id: "extra", label: "Extra", options: ["none", "ranger"] },
];

export const STYLE_LABEL: Record<ClothStyle, string> = {
  none: "None",
  peasant: "Peasant",
  ranger: "Ranger",
};

export function emptyLoadout(): Loadout {
  return { head: "none", body: "peasant", arms: "peasant", legs: "peasant", feet: "peasant", extra: "none" };
}

export function migrateLoadout(raw: Partial<Loadout> | undefined): Loadout {
  const base = emptyLoadout();
  if (!raw) return base;
  for (const slot of CLOTH_SLOTS) {
    const v = raw[slot.id];
    if (v && slot.options.includes(v)) base[slot.id] = v;
  }
  return base;
}

export function cycleStyle(slot: ClothSlot, current: ClothStyle, dir: 1 | -1): ClothStyle {
  const opts = CLOTH_SLOTS.find((s) => s.id === slot)?.options ?? ["none"];
  const i = Math.max(0, opts.indexOf(current));
  return opts[(i + dir + opts.length) % opts.length]!;
}

export function slotOfMesh(name: string): ClothSlot | null {
  const n = name.toLowerCase();
  if (n.includes("hood")) return "head";
  if (n.includes("pauldron")) return "extra";
  if (n.includes("bracer") || n.includes("arms")) return "arms";
  if (n.includes("belt") || n.includes("body")) return "body";
  if (n.includes("feet") || n.includes("boot")) return "feet";
  if (n.includes("leg")) return "legs";
  return null;
}

export function styleOfMesh(name: string): ClothStyle {
  return name.toLowerCase().includes("ranger") ? "ranger" : "peasant";
}

export const OUTFIT_FILES = {
  male: {
    peasant: "/models/outfits/Male_Peasant.gltf",
    ranger: "/models/outfits/Male_Ranger.gltf",
  },
  female: {
    peasant: "/models/outfits/Female_Peasant.gltf",
    ranger: "/models/outfits/Female_Ranger.gltf",
  },
} as const;

export function wearOutfits(body: THREE.Object3D, scenes: THREE.Object3D[]) {
  const boneByName = new Map<string, THREE.Bone>();
  body.traverse((o) => {
    const b = o as THREE.Bone;
    if (b.isBone) boneByName.set(b.name, b);
  });

  const worn: THREE.SkinnedMesh[] = [];
  for (const scene of scenes) {
    const clone = cloneSkinned(scene);
    const meshes: THREE.SkinnedMesh[] = [];
    clone.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) meshes.push(m);
    });
    for (const mesh of meshes) {
      const bones = mesh.skeleton.bones.map((b) => boneByName.get(b.name) ?? b);
      mesh.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      mesh.visible = false;
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => m.clone());
      else mesh.material = mesh.material.clone();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of mats) {
        const mat = raw as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.depthWrite = true;
      }
      mesh.removeFromParent();
      body.add(mesh);
      worn.push(mesh);
    }
  }
  return worn;
}

export function isHeadMesh(mesh: THREE.Object3D) {
  const n = mesh.name.toLowerCase();
  return n.includes("eye") || n.includes("brow");
}

export function installHeadOnly(mat: THREE.MeshStandardMaterial) {
  if (mat.userData.headOnly) return;
  mat.userData.headOnly = true;
  mat.userData.uHeadY = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHeadY = mat.userData.uHeadY;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
       varying float vWorldY;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
       vWorldY = worldPosition.y;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
       uniform float uHeadY;
       varying float vWorldY;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
       if (uHeadY > 0.01 && vWorldY < uHeadY) discard;`,
    );
  };
  mat.customProgramCacheKey = () => "head-only";
  mat.needsUpdate = true;
}

export function setHeadCutY(meshes: THREE.Mesh[], y: number) {
  for (const mesh of meshes) {
    if (isHeadMesh(mesh)) continue;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      const u = (raw as THREE.Material).userData?.uHeadY as { value: number } | undefined;
      if (u) u.value = y;
    }
  }
}

export function applyLoadout(worn: THREE.SkinnedMesh[], loadout: Loadout) {
  for (const mesh of worn) {
    const slot = slotOfMesh(mesh.name);
    const style = styleOfMesh(mesh.name);
    mesh.visible = Boolean(slot && loadout[slot] === style);
  }
}
