import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

export type ClothStyle = "none" | "peasant" | "ranger";
export type ClothSlot = "head" | "body" | "arms" | "legs" | "feet" | "extra";

export type Loadout = Record<ClothSlot, ClothStyle>;

export const CLOTH_SLOTS: { id: ClothSlot; label: string; options: ClothStyle[] }[] = [
  { id: "head", label: "Head", options: ["none", "ranger"] },
  { id: "body", label: "Body", options: ["none", "peasant", "ranger"] },
  { id: "arms", label: "Arms", options: ["none", "peasant", "ranger"] },
  { id: "legs", label: "Legs", options: ["none", "peasant", "ranger"] },
  { id: "feet", label: "Feet", options: ["none", "peasant", "ranger"] },
  { id: "extra", label: "Extra", options: ["none", "ranger"] },
];

export const STYLE_LABEL: Record<ClothStyle, string> = {
  none: "None",
  peasant: "Peasant",
  ranger: "Ranger",
};

export function emptyLoadout(): Loadout {
  return { head: "none", body: "none", arms: "none", legs: "none", feet: "none", extra: "none" };
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
      const slot = slotOfMesh(mesh.name);
      for (const raw of mats) {
        const mat = raw as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.depthWrite = true;
        mat.polygonOffset = false;
        if (slot && slot !== "head") markClothStencil(mat);
      }
      mesh.removeFromParent();
      body.add(mesh);
      worn.push(mesh);
    }
  }
  return worn;
}

export function markClothStencil(mat: THREE.MeshStandardMaterial) {
  mat.stencilWrite = true;
  mat.stencilRef = 1;
  mat.stencilWriteMask = 0xff;
  mat.stencilFuncMask = 0xff;
  mat.stencilFunc = THREE.AlwaysStencilFunc;
  mat.stencilFail = THREE.KeepStencilOp;
  mat.stencilZFail = THREE.KeepStencilOp;
  mat.stencilZPass = THREE.ReplaceStencilOp;
}

export function setBaseUnderClothes(meshes: THREE.Mesh[], hideUnder: boolean) {
  for (const mesh of meshes) {
    mesh.renderOrder = hideUnder ? 2 : 0;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      const mat = raw as THREE.MeshStandardMaterial;
      if (!mat) continue;
      mat.depthWrite = true;
      mat.stencilWrite = false;
      if (hideUnder) {
        mat.stencilFunc = THREE.NotEqualStencilFunc;
        mat.stencilRef = 1;
        mat.stencilFuncMask = 0xff;
      } else {
        mat.stencilFunc = THREE.AlwaysStencilFunc;
      }
    }
  }
}

export function coveringWorn(loadout: Loadout) {
  return loadout.body !== "none" || loadout.arms !== "none" || loadout.legs !== "none" || loadout.feet !== "none";
}

export function applyLoadout(worn: THREE.SkinnedMesh[], loadout: Loadout) {
  for (const mesh of worn) {
    const slot = slotOfMesh(mesh.name);
    const style = styleOfMesh(mesh.name);
    mesh.visible = Boolean(slot && loadout[slot] === style);
  }
}
