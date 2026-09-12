export type TreeSrc = "mega";

export type TreePlace = {
  id: number;
  src: TreeSrc;
  file: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
  radius: number;
};

export type BuildKind =
  | "Wall_Modular"
  | "Fence_Straight_Modular"
  | "Fence_90_Modular"
  | "Fence_End_Modular"
  | "Arch"
  | "Barrel"
  | "Crate"
  | "Column"
  | "Stairs_Modular"
  | "Floor_Modular"
  | "Pedestal"
  | "Vase";

export type BuildPlace = {
  kind: BuildKind;
  x: number;
  z: number;
  rot: number;
  scale: number;
  radius?: number;
  box?: { minX: number; maxX: number; minZ: number; maxZ: number };
};

export type TargetDef = {
  type: "plate" | "barrel" | "vase" | "can" | "crate";
  x: number;
  z: number;
  h?: number;
  rot?: number;
  scale?: number;
};

export const MEGA_TREE_FILES = ["Pine_1", "Pine_2", "Pine_3", "Pine_4", "Pine_5"] as const;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

const rand = rng(91);

function inSpawn(x: number, z: number) {
  return Math.abs(x) < 6 && z > -4 && z < 18;
}

function scatterPines(count: number): TreePlace[] {
  const out: TreePlace[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 24) {
    guard += 1;
    const x = -36 + rand() * 72;
    const z = -40 + rand() * 62;
    if (inSpawn(x, z)) continue;
    const file = MEGA_TREE_FILES[out.length % MEGA_TREE_FILES.length]!;
    out.push({
      id: out.length,
      src: "mega",
      file,
      x,
      z,
      rot: rand() * Math.PI * 2,
      scale: 0.95 + rand() * 0.45,
      radius: 0.48,
    });
  }
  return out;
}

export const TREES: TreePlace[] = scatterPines(32);
export const BUILDINGS: BuildPlace[] = [];

export const TARGETS: TargetDef[] = [
  { type: "plate", x: 0, z: -3.2, h: 1.35 },
  { type: "plate", x: -2.4, z: -4.1, h: 1.15 },
  { type: "plate", x: 2.5, z: -4.0, h: 1.5 },
  { type: "barrel", x: -3.6, z: -2.4, rot: 0.2, scale: 0.85 },
  { type: "crate", x: 3.6, z: -2.2, rot: 0.3, scale: 0.72 },
  { type: "vase", x: -1.4, z: -2.0, scale: 1.8 },
  { type: "can", x: 1.3, z: -1.8 },
];

export const fallenTrees = new Set<number>();

export function markFallen(id: number) {
  fallenTrees.add(id);
}

export const COLLIDERS = [
  ...TREES.map((t) => ({ id: t.id, x: t.x, z: t.z, r: t.radius * t.scale })),
  ...TARGETS.filter((t) => t.type === "barrel" || t.type === "crate").map((t) => ({
    id: -1,
    x: t.x,
    z: t.z,
    r: t.type === "crate" ? 0.45 : 0.4,
  })),
];

export const BOXES: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];

export function resolveCircle(x: number, z: number, radius: number) {
  let px = x;
  let pz = z;
  for (const c of COLLIDERS) {
    if (c.id >= 0 && fallenTrees.has(c.id)) continue;
    const dx = px - c.x;
    const dz = pz - c.z;
    const min = radius + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (min - d) / d;
      px += dx * push;
      pz += dz * push;
    }
  }
  const bound = 48;
  px = Math.max(-bound, Math.min(bound, px));
  pz = Math.max(-bound, Math.min(bound, pz));
  return { x: px, z: pz };
}
