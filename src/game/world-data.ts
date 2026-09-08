export type PropKind =
  | "CommonTree_1"
  | "CommonTree_3"
  | "CommonTree_5"
  | "Pine_1"
  | "Bush_Common"
  | "Grass_Common_Tall"
  | "Grass_Common_Short"
  | "Rock_Medium_1"
  | "Rock_Medium_2"
  | "Rock_Medium_3"
  | "RockPath_Round_Wide"
  | "RockPath_Round_Small_1"
  | "RockPath_Round_Small_2"
  | "RockPath_Round_Small_3";

export type Prop = {
  kind: PropKind;
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

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

const rand = rng(77);

function inLane(x: number, z: number) {
  return Math.abs(x) < 6.2 && z < 18 && z > -20;
}

function scatter(
  count: number,
  xMin: number,
  xMax: number,
  zMin: number,
  zMax: number,
  kind: PropKind,
  scale: number,
  radius: number,
  keepLaneClear = true,
): Prop[] {
  const out: Prop[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 18) {
    guard += 1;
    const x = xMin + rand() * (xMax - xMin);
    const z = zMin + rand() * (zMax - zMin);
    if (keepLaneClear && inLane(x, z)) continue;
    out.push({
      kind,
      x,
      z,
      rot: rand() * Math.PI * 2,
      scale: scale * (0.82 + rand() * 0.4),
      radius,
    });
  }
  return out;
}

export const TREES: Prop[] = [
  ...scatter(10, -28, -7, -28, 22, "CommonTree_1", 1.2, 0.55),
  ...scatter(8, 7, 28, -28, 22, "CommonTree_1", 1.15, 0.55),
  ...scatter(8, -26, -8, -24, 20, "CommonTree_3", 1.05, 0.5),
  ...scatter(7, 8, 26, -24, 20, "CommonTree_3", 1.0, 0.5),
  ...scatter(8, -30, -10, -26, 24, "Pine_1", 1.25, 0.48),
  ...scatter(8, 10, 30, -26, 24, "Pine_1", 1.22, 0.48),
  ...scatter(6, -24, -6, -30, -18, "CommonTree_5", 1.1, 0.5),
  ...scatter(6, 6, 24, -30, -18, "CommonTree_5", 1.08, 0.5),
  ...scatter(5, -22, 22, 16, 30, "CommonTree_1", 1.3, 0.55),
];

export const BUSHES: Prop[] = [
  ...scatter(12, -20, -5, -18, 16, "Bush_Common", 1.35, 0.32),
  ...scatter(12, 5, 20, -18, 16, "Bush_Common", 1.3, 0.32),
];

export const GRASS: Prop[] = [
  ...scatter(22, -16, 16, -16, 16, "Grass_Common_Tall", 1.45, 0, false),
  ...scatter(20, -18, 18, -18, 18, "Grass_Common_Short", 1.35, 0, false),
];

export const ROCKS: Prop[] = [
  ...scatter(5, -18, -6, -16, 12, "Rock_Medium_1", 1.6, 0.7),
  ...scatter(5, 6, 18, -16, 12, "Rock_Medium_2", 1.5, 0.65),
  ...scatter(4, -20, 20, -28, -16, "Rock_Medium_3", 1.8, 0.75),
  { kind: "Rock_Medium_1", x: -4.6, z: 3.2, rot: 0.4, scale: 1.2, radius: 0.55 },
  { kind: "Rock_Medium_2", x: 5.1, z: 1.8, rot: 1.2, scale: 1.1, radius: 0.5 },
  { kind: "Rock_Medium_3", x: -6.4, z: -4.5, rot: 2.1, scale: 1.35, radius: 0.6 },
];

const pathKinds: PropKind[] = [
  "RockPath_Round_Wide",
  "RockPath_Round_Small_1",
  "RockPath_Round_Small_2",
  "RockPath_Round_Small_3",
];

export const PATH_STONES: Prop[] = (() => {
  const out: Prop[] = [];
  for (let i = 0; i < 28; i++) {
    const z = 16 - i * 1.35;
    const x = Math.sin(i * 0.37) * 0.45;
    const kind = pathKinds[i % pathKinds.length];
    out.push({
      kind,
      x,
      z,
      rot: rand() * Math.PI * 2,
      scale: kind.includes("Wide") ? 1.15 : 0.95 + rand() * 0.25,
      radius: 0,
    });
    if (i % 2 === 0) {
      out.push({
        kind: pathKinds[(i + 2) % pathKinds.length],
        x: x + (rand() > 0.5 ? 1.15 : -1.15),
        z: z + (rand() - 0.5) * 0.4,
        rot: rand() * Math.PI * 2,
        scale: 0.75 + rand() * 0.2,
        radius: 0,
      });
    }
  }
  return out;
})();

function wallBox(x: number, z: number, rot: number, scale: number) {
  const alongX = Math.abs(Math.cos(rot)) > 0.7;
  const halfW = 1.0 * scale;
  const halfT = 0.24 * scale;
  if (alongX) {
    return { minX: x - halfW, maxX: x + halfW, minZ: z - halfT, maxZ: z + halfT };
  }
  return { minX: x - halfT, maxX: x + halfT, minZ: z - halfW, maxZ: z + halfW };
}

function fenceBox(x: number, z: number, rot: number, scale: number) {
  const alongX = Math.abs(Math.cos(rot)) > 0.7;
  const halfW = 1.0 * scale;
  const halfT = 0.22 * scale;
  if (alongX) {
    return { minX: x - halfW, maxX: x + halfW, minZ: z - halfT, maxZ: z + halfT };
  }
  return { minX: x - halfT, maxX: x + halfT, minZ: z - halfW, maxZ: z + halfW };
}

export const BUILDINGS: BuildPlace[] = [];

(function layoutBuildings() {
  const walls: BuildPlace[] = [];
  for (let i = -4; i <= 4; i++) {
    const x = i * 2;
    walls.push({
      kind: "Wall_Modular",
      x,
      z: -17.2,
      rot: 0,
      scale: 1,
      box: wallBox(x, -17.2, 0, 1),
    });
  }
  for (let i = 0; i < 6; i++) {
    const z = -16.2 + i * 2;
    walls.push({
      kind: "Wall_Modular",
      x: -9,
      z,
      rot: Math.PI / 2,
      scale: 1,
      box: wallBox(-9, z, Math.PI / 2, 1),
    });
    walls.push({
      kind: "Wall_Modular",
      x: 9,
      z,
      rot: Math.PI / 2,
      scale: 1,
      box: wallBox(9, z, Math.PI / 2, 1),
    });
  }
  BUILDINGS.push(...walls);

  BUILDINGS.push({ kind: "Arch", x: 0, z: 5.6, rot: 0, scale: 1, radius: 0.55 });
  BUILDINGS.push({ kind: "Column", x: -2.55, z: 5.6, rot: 0, scale: 0.85, radius: 0.42 });
  BUILDINGS.push({ kind: "Column", x: 2.55, z: 5.6, rot: 0, scale: 0.85, radius: 0.42 });

  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    BUILDINGS.push({
      kind: "Fence_Straight_Modular",
      x: i * 2,
      z: 8.4,
      rot: 0,
      scale: 1,
      box: fenceBox(i * 2, 8.4, 0, 1),
    });
  }
  BUILDINGS.push({ kind: "Fence_90_Modular", x: -12, z: 8.4, rot: 0, scale: 1, box: fenceBox(-12, 8.4, 0, 1) });
  BUILDINGS.push({ kind: "Fence_90_Modular", x: 12, z: 8.4, rot: Math.PI / 2, scale: 1, box: fenceBox(12, 8.4, Math.PI / 2, 1) });

  const shackZ = 7.2;
  const shackX = -13.5;
  BUILDINGS.push({ kind: "Floor_Modular", x: shackX, z: shackZ, rot: 0, scale: 1.15 });
  BUILDINGS.push({ kind: "Floor_Modular", x: shackX + 2.1, z: shackZ, rot: 0, scale: 1.15 });
  BUILDINGS.push({
    kind: "Wall_Modular",
    x: shackX,
    z: shackZ - 1.15,
    rot: 0,
    scale: 1,
    box: wallBox(shackX, shackZ - 1.15, 0, 1),
  });
  BUILDINGS.push({
    kind: "Wall_Modular",
    x: shackX + 2.05,
    z: shackZ - 1.15,
    rot: 0,
    scale: 1,
    box: wallBox(shackX + 2.05, shackZ - 1.15, 0, 1),
  });
  BUILDINGS.push({
    kind: "Wall_Modular",
    x: shackX - 1.05,
    z: shackZ,
    rot: Math.PI / 2,
    scale: 1,
    box: wallBox(shackX - 1.05, shackZ, Math.PI / 2, 1),
  });
  BUILDINGS.push({ kind: "Stairs_Modular", x: shackX + 3.3, z: shackZ, rot: Math.PI / 2, scale: 0.9, radius: 0.7 });
  BUILDINGS.push({ kind: "Crate", x: shackX + 0.4, z: shackZ + 0.3, rot: 0.4, scale: 0.7, radius: 0.45 });

  for (let i = 0; i < 4; i++) {
    BUILDINGS.push({
      kind: "Fence_Straight_Modular",
      x: -12,
      z: 6.4 - i * 2,
      rot: Math.PI / 2,
      scale: 1,
      box: fenceBox(-12, 6.4 - i * 2, Math.PI / 2, 1),
    });
    BUILDINGS.push({
      kind: "Fence_Straight_Modular",
      x: 12,
      z: 6.4 - i * 2,
      rot: Math.PI / 2,
      scale: 1,
      box: fenceBox(12, 6.4 - i * 2, Math.PI / 2, 1),
    });
  }
})();

export const TARGETS: TargetDef[] = [
  { type: "plate", x: 0, z: -9.2, h: 1.35 },
  { type: "plate", x: -3.4, z: -10.4, h: 1.15 },
  { type: "plate", x: 3.6, z: -10.1, h: 1.5 },
  { type: "plate", x: -6.2, z: -12.6, h: 1.25 },
  { type: "plate", x: 6.4, z: -12.2, h: 1.4 },
  { type: "plate", x: -1.6, z: -14.8, h: 1.2 },
  { type: "plate", x: 1.8, z: -14.6, h: 1.55 },
  { type: "plate", x: 0.2, z: -8.0, h: 0.85 },
  { type: "barrel", x: -4.8, z: -7.2, rot: 0.2, scale: 0.85 },
  { type: "barrel", x: 5.1, z: -6.8, rot: -0.4, scale: 0.9 },
  { type: "barrel", x: -7.4, z: -9.4, rot: 0.8, scale: 0.75 },
  { type: "crate", x: 7.2, z: -8.6, rot: 0.3, scale: 0.72 },
  { type: "vase", x: -2.2, z: -6.6, scale: 1.8 },
  { type: "vase", x: 2.4, z: -6.4, scale: 1.7 },
  { type: "vase", x: 0.8, z: -11.6, scale: 1.9 },
  { type: "can", x: -5.6, z: -5.8 },
  { type: "can", x: -5.15, z: -5.55 },
  { type: "can", x: 4.7, z: -5.4 },
  { type: "can", x: 5.15, z: -5.7 },
  { type: "can", x: 0.4, z: -4.8 },
];

export const COLLIDERS = [
  ...TREES.filter((t) => t.radius > 0).map((t) => ({ x: t.x, z: t.z, r: t.radius * t.scale })),
  ...ROCKS.filter((t) => t.radius > 0).map((t) => ({ x: t.x, z: t.z, r: t.radius * t.scale })),
  ...BUILDINGS.filter((b) => b.radius).map((b) => ({ x: b.x, z: b.z, r: (b.radius ?? 0.4) * b.scale })),
  ...TARGETS.filter((t) => t.type === "barrel" || t.type === "crate").map((t) => ({
    x: t.x,
    z: t.z,
    r: t.type === "crate" ? 0.45 : 0.4,
  })),
];

export const BOXES = BUILDINGS.filter((b) => b.box).map((b) => b.box!);

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
  for (const b of BOXES) {
    const nx = Math.max(b.minX, Math.min(b.maxX, px));
    const nz = Math.max(b.minZ, Math.min(b.maxZ, pz));
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 1e-8) {
        const left = px - b.minX;
        const right = b.maxX - px;
        const down = pz - b.minZ;
        const up = b.maxZ - pz;
        const m = Math.min(left, right, down, up);
        if (m === left) px = b.minX - radius;
        else if (m === right) px = b.maxX + radius;
        else if (m === down) pz = b.minZ - radius;
        else pz = b.maxZ + radius;
      } else {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        px += dx * push;
        pz += dz * push;
      }
    }
  }
  const bound = 40;
  px = Math.max(-bound, Math.min(bound, px));
  pz = Math.max(-bound, Math.min(bound, pz));
  return { x: px, z: pz };
}
