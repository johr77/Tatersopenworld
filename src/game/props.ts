import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";

const templates: Partial<Record<string, THREE.Group>> = {};
const loading: Partial<Record<string, Promise<THREE.Group>>> = {};

function harden(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((raw) => {
      const src = raw as THREE.MeshPhongMaterial;
      const std = new THREE.MeshStandardMaterial({
        color: src.color ?? new THREE.Color("#6a5340"),
        roughness: 0.82,
        metalness: /metal/i.test(src.name || "") ? 0.55 : 0.04,
      });
      if (src.map) {
        std.map = src.map;
        std.map.colorSpace = THREE.SRGBColorSpace;
      }
      return std;
    });
    mesh.material = next.length === 1 ? next[0] : next;
  });
}

function plant(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!Number.isFinite(box.min.y)) return;
  const c = box.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
}

export function loadBuild(name: string): Promise<THREE.Group> {
  if (templates[name]) return Promise.resolve(templates[name]);
  if (loading[name]) return loading[name];
  const objUrl = `/models/build/${name}.obj`;
  const mtlUrl = `/models/build/${name}.mtl`;
  loading[name] = new Promise((resolve) => {
    const finish = (group: THREE.Group) => {
      harden(group);
      plant(group);
      templates[name] = group;
      resolve(group);
    };
    const mtl = new MTLLoader();
    mtl.setResourcePath("/models/build/");
    mtl.load(
      mtlUrl,
      (materials) => {
        materials.preload();
        const obj = new OBJLoader();
        obj.setMaterials(materials);
        obj.load(objUrl, finish, undefined, () => finish(new THREE.Group()));
      },
      undefined,
      () => {
        const obj = new OBJLoader();
        obj.load(objUrl, finish, undefined, () => finish(new THREE.Group()));
      },
    );
  });
  return loading[name];
}

export function loadTreeObj(name: string): Promise<THREE.Group> {
  const key = `tree-${name}`;
  if (templates[key]) return Promise.resolve(templates[key]);
  if (loading[key]) return loading[key];
  const objUrl = `/models/trees2020/${name}.obj`;
  const mtlUrl = `/models/trees2020/${name}.mtl`;
  loading[key] = new Promise((resolve) => {
    const finish = (group: THREE.Group) => {
      harden(group);
      plant(group);
      templates[key] = group;
      resolve(group);
    };
    const mtl = new MTLLoader();
    mtl.setResourcePath("/models/trees2020/");
    mtl.load(
      mtlUrl,
      (materials) => {
        materials.preload();
        const obj = new OBJLoader();
        obj.setMaterials(materials);
        obj.load(objUrl, finish, undefined, () => finish(new THREE.Group()));
      },
      undefined,
      () => {
        const obj = new OBJLoader();
        obj.load(objUrl, finish, undefined, () => finish(new THREE.Group()));
      },
    );
  });
  return loading[key];
}
