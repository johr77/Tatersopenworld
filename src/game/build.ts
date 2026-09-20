import * as THREE from "three";
import { gameState } from "./state";
import type { BuildKind, BuildPlace } from "./world-data";

export type PieceId = "wall" | "door" | "floor" | "corner";

export type PieceDef = {
  id: PieceId;
  label: string;
  kind: BuildKind;
  scale: number;
};

export const PIECES: PieceDef[] = [
  { id: "wall", label: "Wall", kind: "wall", scale: 1 },
  { id: "door", label: "Door", kind: "wall-doorway-square", scale: 1 },
  { id: "floor", label: "Floor", kind: "floor", scale: 1 },
  { id: "corner", label: "Corner", kind: "wall-corner", scale: 1 },
];

export const GRID = 2;
export const TRAY_DELETE = PIECES.length;
export const TRAY_DONE = PIECES.length + 1;
export const TRAY_COUNT = PIECES.length + 2;

const _ndc = new THREE.Vector2(0, 0);
const _ray = new THREE.Raycaster();
const listeners = new Set<() => void>();

export function subscribeBuild(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function bumpBuild() {
  gameState.buildRev += 1;
  for (const fn of listeners) fn();
}

function bump() {
  bumpBuild();
}

export function pieceById(id: PieceId = gameState.buildPiece) {
  return PIECES.find((p) => p.id === id) ?? PIECES[0]!;
}

export function setBuildMode(on: boolean) {
  gameState.buildMode = on;
  gameState.buildTool = "place";
  gameState.buildPending = -1;
  gameState.buildHover = -1;
  gameState.buildConfirm = 0;
  if (on) {
    gameState.buildFocus = Math.min(gameState.buildFocus, TRAY_COUNT - 1);
    gameState.buildX = Math.round(gameState.x / GRID) * GRID;
    gameState.buildZ = Math.round(gameState.z / GRID) * GRID;
  }
  bump();
}

export function setPiece(id: PieceId) {
  gameState.buildPiece = id;
  gameState.buildTool = "place";
  gameState.buildFocus = PIECES.findIndex((p) => p.id === id);
  if (gameState.buildFocus < 0) gameState.buildFocus = 0;
  bump();
}

export function setTrayFocus(i: number) {
  const n = ((i % TRAY_COUNT) + TRAY_COUNT) % TRAY_COUNT;
  gameState.buildFocus = n;
  if (n < PIECES.length) {
    gameState.buildPiece = PIECES[n]!.id;
    gameState.buildTool = "place";
  } else if (n === TRAY_DELETE) gameState.buildTool = "delete";
  bump();
}

export function cycleTray(dir: number) {
  setTrayFocus(gameState.buildFocus + (dir >= 0 ? 1 : -1));
}

export function rotatePiece() {
  gameState.buildYaw = (gameState.buildYaw + 1) % 4;
  bump();
}

export function snapXZ(x: number, z: number) {
  return { x: Math.round(x / GRID) * GRID, z: Math.round(z / GRID) * GRID };
}

export function nudgeCursor(dx: number, dz: number) {
  if (!dx && !dz) return;
  gameState.buildX += dx * GRID;
  gameState.buildZ += dz * GRID;
  bump();
}

export function yawAngle(yaw = gameState.buildYaw) {
  return (yaw * Math.PI) / 2;
}

export function pieceShift(kind: BuildKind = pieceById().kind, yaw = gameState.buildYaw) {
  if (kind === "wall" || kind === "wall-doorway-square") {
    const a = yawAngle(yaw);
    return { x: Math.cos(a), z: -Math.sin(a) };
  }
  return { x: 0, z: 0 };
}

function occKeys(kind: BuildKind, x: number, z: number, rot: number): string[] {
  if (kind === "floor") {
    const gx = Math.round(x / GRID);
    const gz = Math.round(z / GRID);
    return [`f:${gx},${gz}`];
  }
  if (kind === "wall-corner") {
    const gx = Math.round(x / GRID);
    const gz = Math.round(z / GRID);
    return [`e:x:${gx * GRID + GRID / 2}:${gz}`, `e:z:${gz * GRID + GRID / 2}:${gx}`];
  }
  const yaw = ((Math.round(rot / (Math.PI / 2)) % 4) + 4) % 4;
  if (yaw % 2 === 0) return [`e:x:${Math.round(x)}:${Math.round(z / GRID)}`];
  return [`e:z:${Math.round(z)}:${Math.round(x / GRID)}`];
}

export function canPlace(kind: BuildKind, x: number, z: number, rot = yawAngle()) {
  const next = occKeys(kind, x, z, rot);
  for (const b of gameState.buildings) {
    const have = occKeys(b.kind, b.x, b.z, b.rot);
    if (next.some((k) => have.includes(k))) return false;
  }
  return true;
}

export function placeAt(x: number, z: number) {
  const def = pieceById();
  const rot = yawAngle();
  if (!canPlace(def.kind, x, z, rot)) return false;
  gameState.buildings.push({ kind: def.kind, x, z, rot, scale: def.scale });
  bump();
  return true;
}

export function placeCurrent() {
  const def = pieceById();
  const off = pieceShift(def.kind);
  return placeAt(gameState.buildX + off.x, gameState.buildZ + off.z);
}

export function deleteAt(index: number) {
  if (index < 0 || index >= gameState.buildings.length) return false;
  gameState.buildings.splice(index, 1);
  gameState.buildPending = -1;
  gameState.buildHover = -1;
  gameState.buildConfirm = 0;
  bump();
  return true;
}

export function requestDelete(index: number) {
  if (index < 0 || index >= gameState.buildings.length) return;
  gameState.buildPending = index;
  gameState.buildHover = index;
  gameState.buildConfirm = 0;
  bump();
}

export function cancelDelete() {
  gameState.buildPending = -1;
  gameState.buildConfirm = 0;
  bump();
}

export function ghostPose() {
  if (gameState.buildTool === "delete") return null;
  const def = pieceById();
  const off = pieceShift(def.kind);
  const x = gameState.buildX + off.x;
  const z = gameState.buildZ + off.z;
  return {
    x,
    z,
    rot: yawAngle(),
    kind: def.kind,
    scale: def.scale,
    ok: canPlace(def.kind, x, z, yawAngle()),
  };
}

export function pickBuilding(camera: THREE.Camera, scene: THREE.Object3D) {
  _ray.setFromCamera(_ndc, camera);
  _ray.layers.enableAll();
  const hits = _ray.intersectObjects(scene.children, true);
  for (const h of hits) {
    let o: THREE.Object3D | null = h.object;
    while (o) {
      if (typeof o.userData.buildIndex === "number") return o.userData.buildIndex as number;
      o = o.parent;
    }
  }
  return -1;
}

export function migrateBuildings(raw: BuildPlace[] | undefined): BuildPlace[] {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set(PIECES.map((p) => p.kind));
  return raw
    .filter((b) => b && kinds.has(b.kind) && Number.isFinite(b.x) && Number.isFinite(b.z))
    .map((b) => ({
      kind: b.kind,
      x: b.x,
      z: b.z,
      rot: Number.isFinite(b.rot) ? b.rot : 0,
      scale: Number.isFinite(b.scale) ? b.scale : 1,
    }));
}
