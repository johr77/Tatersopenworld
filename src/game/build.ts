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

const _dir = new THREE.Vector3();
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
  if (on) gameState.buildFocus = Math.min(gameState.buildFocus, TRAY_COUNT - 1);
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

export function aimGround(camera: THREE.Camera) {
  camera.getWorldDirection(_dir);
  if (Math.abs(_dir.y) < 0.025) return null;
  const t = -camera.position.y / _dir.y;
  if (t < 0.5 || t > 42) return null;
  return snapXZ(camera.position.x + _dir.x * t, camera.position.z + _dir.z * t);
}

export function yawAngle() {
  return (gameState.buildYaw * Math.PI) / 2;
}

function cellOf(x: number, z: number) {
  return { gx: Math.round(x / GRID), gz: Math.round(z / GRID) };
}

function occKeys(kind: BuildKind, x: number, z: number): string[] {
  const { gx, gz } = cellOf(x, z);
  if (kind === "floor") return [`f:${gx},${gz}`];
  return [`s:${gx},${gz}`];
}

export function canPlace(kind: BuildKind, x: number, z: number) {
  const next = occKeys(kind, x, z);
  for (const b of gameState.buildings) {
    const have = occKeys(b.kind, b.x, b.z);
    if (next.some((k) => have.includes(k))) return false;
  }
  return true;
}

export function placeAt(x: number, z: number) {
  const def = pieceById();
  if (!canPlace(def.kind, x, z)) return false;
  const rot = yawAngle();
  gameState.buildings.push({ kind: def.kind, x, z, rot, scale: def.scale });
  bump();
  return true;
}

export function deleteAt(index: number) {
  if (index < 0 || index >= gameState.buildings.length) return false;
  gameState.buildings.splice(index, 1);
  gameState.buildPending = -1;
  gameState.buildHover = -1;
  bump();
  return true;
}

export function requestDelete(index: number) {
  if (index < 0 || index >= gameState.buildings.length) return;
  gameState.buildPending = index;
  gameState.buildHover = index;
  bump();
}

export function cancelDelete() {
  gameState.buildPending = -1;
  bump();
}

export function ghostPose(camera: THREE.Camera) {
  if (gameState.buildTool === "delete") return null;
  const hit = aimGround(camera);
  if (!hit) return null;
  const def = pieceById();
  return {
    x: hit.x,
    z: hit.z,
    rot: yawAngle(),
    kind: def.kind,
    scale: def.scale,
    ok: canPlace(def.kind, hit.x, hit.z),
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
      x: Math.round(b.x / GRID) * GRID,
      z: Math.round(b.z / GRID) * GRID,
      rot: Number.isFinite(b.rot) ? b.rot : 0,
      scale: Number.isFinite(b.scale) ? b.scale : 1,
    }));
}
