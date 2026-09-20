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
  { id: "wall", label: "Wall", kind: "Wall_Modular", scale: 1 },
  { id: "door", label: "Door", kind: "Arch", scale: 0.5 },
  { id: "floor", label: "Floor", kind: "Floor_Modular", scale: 1 },
  { id: "corner", label: "Corner", kind: "Fence_90_Modular", scale: 1 },
];

export const GRID = 2;

const _dir = new THREE.Vector3();
const listeners = new Set<() => void>();

export function subscribeBuild(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function bump() {
  gameState.buildRev += 1;
  for (const fn of listeners) fn();
}

export function pieceById(id: PieceId = gameState.buildPiece) {
  return PIECES.find((p) => p.id === id) ?? PIECES[0]!;
}

export function setBuildMode(on: boolean) {
  gameState.buildMode = on;
  bump();
}

export function setPiece(id: PieceId) {
  gameState.buildPiece = id;
  bump();
}

export function cyclePiece(dir: number) {
  const i = PIECES.findIndex((p) => p.id === gameState.buildPiece);
  const n = (i + (dir >= 0 ? 1 : PIECES.length - 1)) % PIECES.length;
  gameState.buildPiece = PIECES[n]!.id;
  bump();
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

export function placeAt(x: number, z: number) {
  const def = pieceById();
  const rot = yawAngle();
  const dup = gameState.buildings.some(
    (b) => b.kind === def.kind && b.x === x && b.z === z && Math.abs(b.rot - rot) < 0.01,
  );
  if (dup) return false;
  const row: BuildPlace = { kind: def.kind, x, z, rot, scale: def.scale };
  gameState.buildings.push(row);
  bump();
  return true;
}

export function ghostPose(camera: THREE.Camera) {
  const hit = aimGround(camera);
  if (!hit) return null;
  const def = pieceById();
  return { x: hit.x, z: hit.z, rot: yawAngle(), kind: def.kind, scale: def.scale };
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
