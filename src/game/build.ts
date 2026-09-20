import * as THREE from "three";
import { gameState } from "./state";
import { suppressNav } from "./input";
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

export function yawIndex(rot: number) {
  return ((Math.round(rot / (Math.PI / 2)) % 4) + 4) % 4;
}

export function pieceShift(kind: BuildKind = pieceById().kind, yaw = gameState.buildYaw) {
  if (kind === "wall" || kind === "wall-doorway-square") {
    const a = yawAngle(yaw);
    return { x: Math.cos(a) * 0.95, z: -Math.sin(a) * 0.95 };
  }
  return { x: 0, z: 0 };
}

export function pieceY(kind: BuildKind) {
  return kind === "floor" ? 0 : 0.1;
}

export function pieceScale(kind: BuildKind): [number, number, number] {
  if (kind === "wall-doorway-square") return [0.5, 1, 1];
  return [1, 1, 1];
}

export function placedPose(place: { kind: BuildKind; x: number; z: number; rot: number }) {
  const off = pieceShift(place.kind, yawIndex(place.rot));
  return { x: place.x + off.x, y: pieceY(place.kind), z: place.z + off.z, scale: pieceScale(place.kind) };
}

function cornerEdges(gx: number, gz: number, yaw: number) {
  const east = `e:x:${gx * GRID + GRID / 2}:${gz}`;
  const west = `e:x:${gx * GRID - GRID / 2}:${gz}`;
  const north = `e:z:${gz * GRID + GRID / 2}:${gx}`;
  const south = `e:z:${gz * GRID - GRID / 2}:${gx}`;
  if (yaw === 0) return [east, north];
  if (yaw === 1) return [south, east];
  if (yaw === 2) return [west, south];
  return [north, west];
}

function occKeys(kind: BuildKind, x: number, z: number, rot: number): string[] {
  const gx = Math.round(x / GRID);
  const gz = Math.round(z / GRID);
  const yaw = yawIndex(rot);
  if (kind === "floor") return [`f:${gx},${gz}`];
  if (kind === "wall-corner") return cornerEdges(gx, gz, yaw);
  const off = pieceShift(kind, yaw);
  if (yaw % 2 === 0) return [`e:x:${Math.round(x + off.x)}:${gz}`];
  return [`e:z:${Math.round(z + off.z)}:${gx}`];
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
  const cell = snapXZ(x, z);
  if (!canPlace(def.kind, cell.x, cell.z, rot)) return false;
  gameState.buildings.push({ kind: def.kind, x: cell.x, z: cell.z, rot, scale: def.scale });
  bump();
  return true;
}

export function placeCurrent() {
  return placeAt(gameState.buildX, gameState.buildZ);
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
  gameState.buildConfirmLock = true;
  suppressNav(0);
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
  const rot = yawAngle();
  const off = pieceShift(def.kind);
  return {
    x: gameState.buildX + off.x,
    z: gameState.buildZ + off.z,
    y: pieceY(def.kind),
    rot,
    kind: def.kind,
    scale: def.scale,
    ok: canPlace(def.kind, gameState.buildX, gameState.buildZ, rot),
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
    .map((b) => {
      let x = b.x;
      let z = b.z;
      if (b.kind === "wall" || b.kind === "wall-doorway-square") {
        const a = yawIndex(b.rot) * (Math.PI / 2);
        x -= Math.cos(a);
        z += Math.sin(a);
      }
      const cell = snapXZ(x, z);
      return {
        kind: b.kind,
        x: cell.x,
        z: cell.z,
        rot: Number.isFinite(b.rot) ? b.rot : 0,
        scale: Number.isFinite(b.scale) ? b.scale : 1,
      };
    });
}
