export type Prop = {
  kind: "CommonTree_1" | "CommonTree_3" | "CommonTree_5" | "Pine_1" | "Bush_Common" | "Grass_Common_Tall" | "Grass_Common_Short";
  x: number;
  z: number;
  rot: number;
  scale: number;
  radius: number;
};

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

const rand = rng(77);

function ring(count: number, rMin: number, rMax: number, kind: Prop["kind"], scale: number, radius: number): Prop[] {
  const out: Prop[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.35;
    const r = rMin + rand() * (rMax - rMin);
    out.push({
      kind,
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      rot: rand() * Math.PI * 2,
      scale: scale * (0.85 + rand() * 0.35),
      radius,
    });
  }
  return out;
}

export const TREES: Prop[] = [
  ...ring(8, 11, 16, "CommonTree_1", 1.15, 0.55),
  ...ring(6, 14, 20, "CommonTree_3", 1.05, 0.5),
  ...ring(6, 16, 24, "Pine_1", 1.2, 0.48),
  ...ring(5, 18, 26, "CommonTree_5", 1.1, 0.5),
];

export const BUSHES: Prop[] = ring(14, 6, 18, "Bush_Common", 1.3, 0.35);

export const GRASS: Prop[] = [
  ...ring(18, 3, 12, "Grass_Common_Tall", 1.4, 0),
  ...ring(16, 4, 14, "Grass_Common_Short", 1.3, 0),
];

export const TARGETS = [
  { x: 0, z: -9, h: 1.4 },
  { x: -4.5, z: -11, h: 1.2 },
  { x: 5.2, z: -10.5, h: 1.6 },
  { x: -8, z: -7, h: 1.3 },
  { x: 8.5, z: -8, h: 1.5 },
];

export const COLLIDERS = [
  ...TREES.filter((t) => t.radius > 0).map((t) => ({ x: t.x, z: t.z, r: t.radius * t.scale })),
  ...TARGETS.map((t) => ({ x: t.x, z: t.z, r: 0.28 })),
];

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
  const bound = 36;
  px = Math.max(-bound, Math.min(bound, px));
  pz = Math.max(-bound, Math.min(bound, pz));
  return { x: px, z: pz };
}
