export type PropKind =
  | "CommonTree_1"
  | "CommonTree_2"
  | "CommonTree_3"
  | "CommonTree_4"
  | "CommonTree_5"
  | "Pine_1"
  | "Pine_2"
  | "Pine_3"
  | "Pine_4"
  | "Pine_5"
  | "TwistedTree_1"
  | "TwistedTree_2"
  | "TwistedTree_3"
  | "TwistedTree_4"
  | "TwistedTree_5"
  | "DeadTree_1"
  | "DeadTree_2"
  | "DeadTree_3"
  | "DeadTree_4"
  | "DeadTree_5";

export type Prop = {
  kind: PropKind;
  x: number;
  z: number;
  rot: number;
  scale: number;
  radius: number;
};

export type TreeSrc = "mega" | "tex";

export type TreePlace = {
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

export const MEGA_TREE_FILES = [
  "CommonTree_1",
  "CommonTree_2",
  "CommonTree_3",
  "CommonTree_4",
  "CommonTree_5",
  "Pine_1",
  "Pine_2",
  "Pine_3",
  "Pine_4",
  "Pine_5",
  "TwistedTree_1",
  "TwistedTree_2",
  "TwistedTree_3",
  "TwistedTree_4",
  "TwistedTree_5",
  "DeadTree_1",
  "DeadTree_2",
  "DeadTree_3",
  "DeadTree_4",
  "DeadTree_5",
] as const;

export const TEX_TREE_FILES = [
  "Tree_1",
  "Tree_2",
  "Tree_3",
  "Tree_4",
  "Tree_5",
  "Tree_6",
  "Tree_7",
  "Tree_8",
  "Tree_9",
  "Tree_10",
  "Birch_1",
  "Birch_2",
  "Birch_3",
  "Birch_4",
  "Birch_5",
  "Birch_6",
  "Birch_7",
  "Birch_8",
  "Birch_9",
  "Birch_10",
  "Pine_1",
  "Pine_2",
  "Pine_3",
  "Pine_4",
  "Pine_5",
  "DeadTree_1",
  "DeadTree_2",
  "DeadTree_3",
  "DeadTree_4",
  "DeadTree_5",
  "DeadTree_6",
  "DeadTree_7",
  "DeadTree_8",
  "DeadTree_9",
  "DeadTree_10",
  "DeadBirch_1",
  "DeadBirch_2",
  "DeadBirch_3",
  "DeadBirch_4",
  "DeadBirch_5",
  "DeadBirch_6",
  "DeadBirch_7",
  "DeadBirch_8",
  "DeadBirch_9",
  "DeadBirch_10",
] as const;

function catalog(): TreePlace[] {
  const items: { src: TreeSrc; file: string; scale: number }[] = [
    ...MEGA_TREE_FILES.map((file) => ({ src: "mega" as const, file, scale: 1.05 })),
    ...TEX_TREE_FILES.map((file) => ({ src: "tex" as const, file, scale: 1 })),
  ];
  const cols = 8;
  const gap = 8;
  const startX = -((cols - 1) * gap) / 2;
  const startZ = -8;
  return items.map((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      src: item.src,
      file: item.file,
      x: startX + col * gap,
      z: startZ - row * gap,
      rot: (i * 0.73) % (Math.PI * 2),
      scale: item.scale,
      radius: 0.5,
    };
  });
}

export const TREES: TreePlace[] = catalog();
export const BUSHES: Prop[] = [];
export const GRASS: Prop[] = [];
export const ROCKS: Prop[] = [];
export const PATH_STONES: Prop[] = [];
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

export const COLLIDERS = [
  ...TREES.filter((t) => t.radius > 0).map((t) => ({ x: t.x, z: t.z, r: t.radius * t.scale })),
  ...TARGETS.filter((t) => t.type === "barrel" || t.type === "crate").map((t) => ({
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
  const bound = 70;
  px = Math.max(-bound, Math.min(bound, px));
  pz = Math.max(-bound, Math.min(bound, pz));
  return { x: px, z: pz };
}
