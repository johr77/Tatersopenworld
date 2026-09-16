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

function scatterPines(): TreePlace[] {
  const out: TreePlace[] = [];
  const add = (x: number, z: number, scale: number) => {
    out.push({
      id: out.length,
      src: "mega",
      file: MEGA_TREE_FILES[out.length % MEGA_TREE_FILES.length]!,
      x,
      z,
      rot: out.length * 0.7,
      scale,
      radius: 0.48,
    });
  };
  const cx = 0;
  const cz = 12;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    add(cx + Math.sin(a) * 8, cz + Math.cos(a) * 8, 1.35);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    add(cx + Math.sin(a) * 16, cz + Math.cos(a) * 16, 1.28 + (i % 3) * 0.1);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.4;
    add(cx + Math.sin(a) * 24, cz - 4 + Math.cos(a) * 20, 1.42);
  }
  return out;
}

export const TREES: TreePlace[] = scatterPines();

export type WeedKind = "short" | "tall";
export type WeedPlace = { id: number; x: number; z: number; rot: number; scale: number; kind: WeedKind };

function scatterWeeds(): WeedPlace[] {
  const out: WeedPlace[] = [];
  const cx = 0;
  const cz = 12;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + 0.35;
    const r = 3.6 + (i % 5) * 1.2;
    const x = cx + Math.sin(a) * r;
    const z = cz + Math.cos(a) * r;
    if (Math.hypot(x - cx, z - cz) < 2.2) continue;
    const tall = i % 7 === 0;
    out.push({
      id: out.length,
      x,
      z,
      rot: i * 0.9,
      kind: tall ? "tall" : "short",
      scale: tall ? 0.82 : 1.25 + (i % 4) * 0.08,
    });
  }
  return out;
}

export const WEEDS: WeedPlace[] = scatterWeeds();

export type StonePlace = { id: number; x: number; z: number; rot: number; scale: number; file: string };

function scatterStones(): StonePlace[] {
  const files = ["Pebble_Round_1", "Pebble_Round_2", "Pebble_Round_3"];
  const out: StonePlace[] = [];
  const cx = 0;
  const cz = 12;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.8;
    const r = 3.1 + (i % 4) * 1.05;
    const x = cx + Math.sin(a) * r;
    const z = cz + Math.cos(a) * r;
    if (Math.hypot(x - cx, z - cz) < 1.8) continue;
    out.push({
      id: out.length,
      x,
      z,
      rot: i * 1.1,
      scale: 0.55 + (i % 3) * 0.12,
      file: files[i % files.length]!,
    });
  }
  return out;
}

export const STONES: StonePlace[] = scatterStones();
export const STASH = { x: 2.8, z: -0.6, rot: -0.35, scale: 1.05 };
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
  { id: -2, x: STASH.x, z: STASH.z, r: 0.55 },
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
