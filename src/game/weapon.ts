import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";

export type WeaponId = "pistol" | "ar" | "shotgun";

export type WeaponDef = {
  id: WeaponId;
  name: string;
  mag: number;
  reserve: number;
  fireCd: number;
  reload: number;
  recoil: number;
  length: number;
  /** Distance from the butt to the trigger, after the gun is scaled to `length`. */
  gripBack: number;
  drop: number;
  /** Hand-local hold: −X into palm, +Y along fingers, +Z thumb. */
  hold: [number, number, number];
  /** Extra Euler XYZ on the hold (radians). Base is Rx(90) so barrel follows the fingers. */
  holdRot: [number, number, number];
  obj: string;
  mtl: string;
};

export const WEAPONS: WeaponDef[] = [
  { id: "pistol", name: "Pistol", mag: 12, reserve: 36, fireCd: 0.15, reload: 1.35, recoil: 0.038, length: 0.26, gripBack: 0.055, drop: 0.012, hold: [-0.034, 0.100, 0.036], holdRot: [Math.PI / 2, -0.18, 0], obj: "/models/weapon/quaternius/Pistol_1.obj", mtl: "/models/weapon/quaternius/Pistol_1.mtl" },
  { id: "ar", name: "Rifle", mag: 30, reserve: 90, fireCd: 0.1, reload: 2.05, recoil: 0.032, length: 0.78, gripBack: 0.30, drop: 0.02, hold: [-0.0, 0.32, 0.028], holdRot: [Math.PI / 2, -0.18, 0], obj: "/models/weapon/quaternius/AssaultRifle_1.obj", mtl: "/models/weapon/quaternius/AssaultRifle_1.mtl" },
  { id: "shotgun", name: "Shotgun", mag: 6, reserve: 24, fireCd: 0.55, reload: 2.4, recoil: 0.07, length: 0.72, gripBack: 0.27, drop: 0.016, hold: [-0.035, 0.16, 0.055], holdRot: [Math.PI / 2, -0.18, 0], obj: "/models/weapon/quaternius/Shotgun_1.obj", mtl: "/models/weapon/quaternius/Shotgun_1.mtl" },
];

function fallbackGun(length: number) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#2c2f32", metalness: 0.7, roughness: 0.35 });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, length), mat);
  barrel.position.z = -length * 0.35;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, length * 0.35), mat);
  body.position.set(0, -0.02, 0.02);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: "#3a2a22", roughness: 0.8 }));
  grip.position.set(0, -0.1, 0.06);
  g.add(barrel, body, grip);
  return g;
}

function harden(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((raw) => {
      const mat = raw as THREE.MeshPhongMaterial;
      const std = new THREE.MeshStandardMaterial({
        color: mat.color ?? new THREE.Color("#3a3d40"),
        metalness: 0.62,
        roughness: 0.38,
      });
      if (mat.map) {
        std.map = mat.map;
        std.map.colorSpace = THREE.SRGBColorSpace;
      }
      return std;
    });
    mesh.material = next.length === 1 ? next[0] : next;
  });
}

/** Quaternius OBJ guns: barrel +X, up +Y, thin Z. Map barrel to camera-forward −Z.
 *  Origin is placed at the trigger so the hold can sit on the index finger. */
function aimBarrelNegZ(obj: THREE.Object3D, length: number, gripBack: number, drop: number) {
  obj.rotation.set(0, Math.PI / 2, 0);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  obj.position.sub(box.getCenter(new THREE.Vector3()));
  obj.scale.multiplyScalar(length / Math.max(size.x, size.y, size.z, 0.001));
  obj.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.sub(box2.getCenter(new THREE.Vector3()));
  obj.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(obj);
  obj.position.z += -box3.max.z + gripBack;
  obj.position.y -= drop;
}

function loadGun(def: WeaponDef): Promise<THREE.Object3D> {
  const wrap = new THREE.Group();
  wrap.name = def.id;
  return new Promise((resolve) => {
    const mtlLoader = new MTLLoader();
    mtlLoader.setResourcePath("/models/weapon/quaternius/");
    mtlLoader.load(
      def.mtl,
      (mtl) => {
        mtl.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(mtl);
        objLoader.load(
          def.obj,
          (obj) => {
            harden(obj);
            aimBarrelNegZ(obj, def.length, def.gripBack, def.drop);
            wrap.add(obj);
            resolve(wrap);
          },
          undefined,
          () => {
            wrap.add(fallbackGun(def.length));
            resolve(wrap);
          },
        );
      },
      undefined,
      () => {
        const objLoader = new OBJLoader();
        objLoader.load(
          def.obj,
          (obj) => {
            harden(obj);
            aimBarrelNegZ(obj, def.length, def.gripBack, def.drop);
            wrap.add(obj);
            resolve(wrap);
          },
          undefined,
          () => {
            wrap.add(fallbackGun(def.length));
            resolve(wrap);
          },
        );
      },
    );
  });
}

const templates: Partial<Record<WeaponId, THREE.Object3D>> = {};
const loading: Partial<Record<WeaponId, Promise<THREE.Object3D>>> = {};

function getGun(def: WeaponDef): Promise<THREE.Object3D> {
  const ready = templates[def.id];
  if (ready) return Promise.resolve(ready.clone(true));
  if (!loading[def.id]) {
    loading[def.id] = loadGun(def).then((gun) => {
      templates[def.id] = gun;
      return gun;
    });
  }
  return loading[def.id]!.then((gun) => gun.clone(true));
}

export type WeaponHandle = {
  root: THREE.Group;
  setId: (id: WeaponId) => void;
  setLowered: (low: boolean) => void;
  aimAt: (target: THREE.Vector3 | null) => void;
  children: () => number;
  dispose: () => void;
};

function fill(parent: THREE.Group) {
  const slots = {} as Record<WeaponId, THREE.Object3D>;
  const ready = Promise.all(
    WEAPONS.map((def) =>
      getGun(def).then((gun) => {
        gun.visible = false;
        parent.add(gun);
        slots[def.id] = gun;
      }),
    ),
  );
  return { slots, ready };
}

const _dir = new THREE.Vector3();
const _worldQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _negZ = new THREE.Vector3(0, 0, -1);

export function attachWeapons(hand: THREE.Object3D): WeaponHandle {
  const root = new THREE.Group();
  root.name = "WeaponHold";
  hand.add(root);
  const { slots, ready } = fill(root);
  let current: WeaponId = "ar";
  const holdOf = (id: WeaponId) => WEAPONS.find((w) => w.id === id) ?? WEAPONS[1];
  const applyHold = () => {
    const def = holdOf(current);
    const h = def.hold;
    const r = def.holdRot;
    root.position.set(h[0], h[1], h[2]);
    root.rotation.set(r[0], r[1], r[2]);
  };
  applyHold();
  const show = (id: WeaponId) => {
    current = id;
    for (const key of Object.keys(slots) as WeaponId[]) {
      if (slots[key]) slots[key].visible = key === id;
    }
    applyHold();
  };
  void ready.then(() => show(current));

  return {
    root,
    setId: show,
    setLowered: () => applyHold(),
    aimAt: (target) => {
      applyHold();
      if (!target) return;
      const parent = root.parent;
      if (!parent) return;
      parent.updateWorldMatrix(true, false);
      parent.localToWorld(_dir.set(root.position.x, root.position.y, root.position.z));
      _dir.set(target.x - _dir.x, target.y - _dir.y, target.z - _dir.z);
      if (_dir.lengthSq() < 0.0001) return;
      _dir.normalize();
      _worldQ.setFromUnitVectors(_negZ, _dir);
      parent.getWorldQuaternion(_parentQ);
      root.quaternion.copy(_parentQ.invert()).multiply(_worldQ);
    },
    children: () => root.children.length,
    dispose: () => {
      hand.remove(root);
    },
  };
}

export function makeViewmodel(): WeaponHandle {
  const root = new THREE.Group();
  root.name = "Viewmodel";
  const hipPos = new THREE.Vector3(0.28, -0.24, -0.5);
  const adsPos = new THREE.Vector3(0.0, -0.145, -0.38);
  const hipRot = new THREE.Euler(0.08, 0, 0.04);
  const adsRot = new THREE.Euler(0, 0, 0);
  root.position.copy(hipPos);
  root.rotation.copy(hipRot);

  const { slots, ready } = fill(root);
  let current: WeaponId = "ar";
  const show = (id: WeaponId) => {
    current = id;
    for (const key of Object.keys(slots) as WeaponId[]) {
      if (slots[key]) slots[key].visible = key === id;
    }
  };
  void ready.then(() => show(current));

  return {
    root,
    setId: show,
    setLowered: (low) => {
      root.position.copy(low ? hipPos : adsPos);
      root.rotation.copy(low ? hipRot : adsRot);
    },
    aimAt: () => {},
    children: () => root.children.length,
    dispose: () => {
      root.removeFromParent();
    },
  };
}
