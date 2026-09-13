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
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -1;
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
  return n.includes("face") || (n.includes("eye") && !n.includes("brow"));
}

export function isHairMesh(mesh: THREE.Object3D) {
  const n = mesh.name.toLowerCase();
  return n.includes("hair") || n.includes("brow");
}

const HEAD_BONE = /head|jaw|face/i;
const NECK_BONE = /neck/i;
const TORSO_BONE = /spine|clavicle|shoulder|pelvis/i;

export function installHeadOnly(mat: THREE.MeshStandardMaterial) {
  mat.userData.headOnly = true;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
       attribute float headKeep;
       varying float vHeadKeep;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       vHeadKeep = headKeep;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
       varying float vHeadKeep;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
       if (vHeadKeep < 0.42) discard;`,
    );
  };
  mat.customProgramCacheKey = () => `head-keep-${mat.uuid}`;
  mat.needsUpdate = true;
}

function bakeHeadKeep(mesh: THREE.SkinnedMesh) {
  if (mesh.geometry.getAttribute("headKeep")) return;
  mesh.geometry = mesh.geometry.clone();
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position");
  if (!pos) return;
  const nVert = pos.count;
  const arr = new Float32Array(nVert);
  const idx = geo.getAttribute("skinIndex");
  const wgt = geo.getAttribute("skinWeight");
  if (!idx || !wgt || !mesh.skeleton) {
    arr.fill(1);
    geo.setAttribute("headKeep", new THREE.BufferAttribute(arr, 1));
    return;
  }
  // Keep face + neck. Drop chest/shoulders even if they have a little neck weight
  // (the female superhero mesh is face+suit in one piece).
  const kind = new Uint8Array(mesh.skeleton.bones.length + 8);
  mesh.skeleton.bones.forEach((b, i) => {
    if (HEAD_BONE.test(b.name)) kind[i] = 1;
    else if (NECK_BONE.test(b.name)) kind[i] = 2;
    else if (TORSO_BONE.test(b.name)) kind[i] = 3;
  });
  const ia = idx.array;
  const wa = wgt.array;
  const size = idx.itemSize;
  for (let i = 0; i < nVert; i++) {
    let headW = 0;
    let neckW = 0;
    let torsoW = 0;
    const base = i * size;
    for (let j = 0; j < size; j++) {
      const bi = Number(ia[base + j]) | 0;
      const w = Number(wa[base + j]);
      if (bi < 0) continue;
      if (kind[bi] === 1) headW += w;
      else if (kind[bi] === 2) neckW += w;
      else if (kind[bi] === 3) torsoW += w;
    }
    const face = headW > 0.28;
    const neck = neckW > 0.4 && torsoW < 0.38 && neckW + headW > torsoW;
    arr[i] = face || neck ? 1 : 0;
  }
  geo.setAttribute("headKeep", new THREE.BufferAttribute(arr, 1));
}

export function applyHeadOnly(meshes: THREE.Mesh[]) {
  for (const mesh of meshes) {
    if (isHeadMesh(mesh) || mesh.name.startsWith("Hit_")) continue;
    const skinned = mesh as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) bakeHeadKeep(skinned);
  }
}

export function applyLoadout(worn: THREE.SkinnedMesh[], loadout: Loadout) {
  for (const mesh of worn) {
    const slot = slotOfMesh(mesh.name);
    const style = styleOfMesh(mesh.name);
    mesh.visible = Boolean(slot && loadout[slot] === style);
  }
}

export function applyHairVisibility(meshes: THREE.Mesh[], hoodOn: boolean) {
  for (const mesh of meshes) {
    if (isHairMesh(mesh)) mesh.visible = !hoodOn;
  }
}
