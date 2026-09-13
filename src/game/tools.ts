import * as THREE from "three";

/** Metres on the ground. Snap only to something right next to you, not 10ft away. */
export const TOOL_SNAP_RANGE = 2.15;
/** Must be in front of the look direction (~65°). Picks what you were swinging toward. */
const TOOL_SNAP_DOT = 0.42;

const _to = new THREE.Vector3();

export function isToolMaterial(obj: THREE.Object3D, toolId: string) {
  if (toolId === "axe") return Boolean(obj.userData?.tree && typeof obj.userData.chop === "function");
  return false;
}

export function isUseTarget(obj: THREE.Object3D) {
  return typeof obj.userData?.use === "function";
}

/** Closest in-front Action target (weeds now, doors later). */
export function nearestUseTarget(
  scene: THREE.Object3D,
  origin: THREE.Vector3,
  lookXz: THREE.Vector3,
  range = TOOL_SNAP_RANGE,
): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  let bestScore = TOOL_SNAP_DOT;
  const lx = lookXz.x;
  const lz = lookXz.z;
  const llen = Math.hypot(lx, lz) || 1;
  const nx = lx / llen;
  const nz = lz / llen;
  scene.traverse((o) => {
    if (!o.visible || !isUseTarget(o)) return;
    o.getWorldPosition(_to);
    const dx = _to.x - origin.x;
    const dz = _to.z - origin.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > range * range || d2 < 0.04) return;
    const d = Math.sqrt(d2);
    const dot = (dx / d) * nx + (dz / d) * nz;
    if (dot > bestScore) {
      bestScore = dot;
      best = o;
    }
  });
  return best;
}

/** Closest in-front tool target (tree for the axe). */
export function nearestToolTarget(
  scene: THREE.Object3D,
  origin: THREE.Vector3,
  lookXz: THREE.Vector3,
  toolId: string,
  range = TOOL_SNAP_RANGE,
): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  let bestScore = TOOL_SNAP_DOT;
  const lx = lookXz.x;
  const lz = lookXz.z;
  const llen = Math.hypot(lx, lz) || 1;
  const nx = lx / llen;
  const nz = lz / llen;
  scene.traverse((o) => {
    if (!o.visible || !isToolMaterial(o, toolId)) return;
    o.getWorldPosition(_to);
    const dx = _to.x - origin.x;
    const dz = _to.z - origin.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > range * range || d2 < 0.16) return;
    const d = Math.sqrt(d2);
    const dot = (dx / d) * nx + (dz / d) * nz;
    if (dot > bestScore) {
      bestScore = dot;
      best = o;
    }
  });
  return best;
}
