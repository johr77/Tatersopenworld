import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { charById, type CharDef } from "./characters";

const gltf = new GLTFLoader();

const bodyCache = new Map<string, Promise<THREE.Group>>();
const hairCache = new Map<string, Promise<THREE.Group>>();

function loadGltf(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    gltf.load(url, (g) => resolve(g.scene), undefined, reject);
  });
}

function cached(map: Map<string, Promise<THREE.Group>>, url: string) {
  let p = map.get(url);
  if (!p) {
    p = loadGltf(url);
    map.set(url, p);
  }
  return p;
}

function findNamed(root: THREE.Object3D, names: string[]): THREE.Object3D | null {
  const want = names.map((n) => n.toLowerCase());
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (hit || !o.name) return;
    const n = o.name.toLowerCase();
    if (want.some((w) => n === w || n.endsWith(w))) hit = o;
  });
  return hit;
}

function prepMat(mat: THREE.Material, hair: boolean) {
  const std = mat as THREE.MeshStandardMaterial;
  if (!std) return;
  if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
  std.side = THREE.DoubleSide;
  if (hair) {
    std.transparent = false;
    std.alphaTest = 0.4;
    std.depthWrite = true;
    std.roughness = Math.min(std.roughness ?? 0.75, 0.7);
  }
}

function prepMats(root: THREE.Object3D, hair: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = !hair;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) prepMat(mat, hair);
  });
}

/**
 * UBC "Rigged to Head Bone" hair is a full extra armature + a mesh whose
 * vertices are already in bind-pose world space (y ≈ 1.5–1.8). Parenting that
 * whole scene to Head doubles the offset. Skin-syncing a female cut onto a
 * male skeleton (and vice versa) also lifts the volume off the skull.
 *
 * Bake bind-pose verts into the *body* Head's local space, then parent a
 * static mesh to Head so the cut sits on the scalp and follows walk.
 */
function attachHairToHead(body: THREE.Group, hairRoot: THREE.Group, inner: THREE.Group, hairMeshes: THREE.Object3D[]) {
  const head = findNamed(body, ["head"]);
  if (!head) {
    inner.add(hairRoot);
    return;
  }
  inner.updateWorldMatrix(true, true);
  const innerWorld = inner.matrixWorld;
  const invHead = new THREE.Matrix4().copy(head.matrixWorld).invert();
  const innerToHead = new THREE.Matrix4().multiplyMatrices(invHead, innerWorld);

  const skinned: THREE.SkinnedMesh[] = [];
  hairRoot.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) skinned.push(m);
  });

  for (const sm of skinned) {
    const geom = sm.geometry.clone();
    geom.applyMatrix4(innerToHead);
    const mats = Array.isArray(sm.material) ? sm.material.map((m) => m.clone()) : sm.material.clone();
    const list = Array.isArray(mats) ? mats : [mats];
    for (const mat of list) prepMat(mat, true);
    const mesh = new THREE.Mesh(geom, mats);
    mesh.name = sm.name || "Hair";
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    head.add(mesh);
    hairMeshes.push(mesh);
  }
}

export type CharacterRig = {
  wrap: THREE.Group;
  hand: THREE.Object3D;
  head: THREE.Object3D | null;
  def: CharDef;
  setMoving: (v: boolean) => void;
  playChop: () => void;
  playFire: () => void;
  update: (dt: number) => void;
  hideHead: (hide: boolean) => void;
  dispose: () => void;
};

export async function loadCharacter(charId: string, height = 1.7): Promise<CharacterRig> {
  const def = charById(charId);
  const bodyUrl =
    def.body === "female"
      ? "/env/chars/Superhero_Female_FullBody.gltf"
      : "/env/chars/Superhero_Male_FullBody.gltf";

  const hairUrls = def.hairs.map((h) => `/env/hair/${h}.gltf`);
  const [bodySrc, ...hairSrcList] = await Promise.all([
    cached(bodyCache, bodyUrl),
    ...hairUrls.map((u) => cached(hairCache, u).catch(() => null)),
  ]);

  const body = SkeletonUtils.clone(bodySrc) as THREE.Group;
  prepMats(body, false);

  const box = new THREE.Box3().setFromObject(body);
  const size = new THREE.Vector3();
  box.getSize(size);
  const wrap = new THREE.Group();
  const inner = new THREE.Group();
  const s = size.y > 0.01 ? height / size.y : 1;
  inner.scale.setScalar(s);
  inner.position.y = -box.min.y * s;
  inner.add(body);
  wrap.add(inner);

  const head = findNamed(body, ["head"]);
  const hand =
    findNamed(body, ["hand_r", "righthand", "mixamorigrighthand", "hand.r"]) ?? wrap;

  const hairMeshes: THREE.Object3D[] = [];
  for (const src of hairSrcList) {
    if (!src) continue;
    const hair = SkeletonUtils.clone(src) as THREE.Group;
    attachHairToHead(body, hair, inner, hairMeshes);
  }

  const thighL = findNamed(body, ["thigh_l", "leftupleg", "mixamorigleftupleg"]);
  const thighR = findNamed(body, ["thigh_r", "rightupleg", "mixamorigrightupleg"]);
  const calfL = findNamed(body, ["calf_l", "leftleg", "mixamorigleftleg"]);
  const calfR = findNamed(body, ["calf_r", "rightleg", "mixamorigrightleg"]);
  const armL = findNamed(body, ["upperarm_l", "leftarm", "mixamorigleftarm"]);
  const armR = findNamed(body, ["upperarm_r", "rightarm", "mixamorigrightarm"]);
  const lowL = findNamed(body, ["lowerarm_l", "leftforearm", "mixamorigleftforearm"]);
  const lowR = findNamed(body, ["lowerarm_r", "rightforearm", "mixamorigrightforearm"]);
  const spine = findNamed(body, ["spine_01", "spine", "mixamorigspine"]);

  const bones = [thighL, thighR, calfL, calfR, armL, armR, lowL, lowR, spine].filter(
    Boolean,
  ) as THREE.Object3D[];
  const rest = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const b of bones) rest.set(b, b.quaternion.clone());

  let moving = false;
  let phase = 0;
  let chopT = 0;
  let fireT = 0;

  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const APOSE = 0.56;

  function apply(bone: THREE.Object3D | null, ax: number, ay: number, az: number) {
    if (!bone) return;
    const r = rest.get(bone);
    if (!r) return;
    e.set(ax, ay, az, "XYZ");
    q.setFromEuler(e);
    bone.quaternion.copy(r).multiply(q);
  }

  return {
    wrap,
    hand,
    head,
    def,
    setMoving: (v) => {
      moving = v;
    },
    playChop: () => {
      chopT = 0.32;
    },
    playFire: () => {
      fireT = 0.16;
    },
    update: (dt) => {
      phase += dt * (moving ? 9 : 1.15);
      chopT = Math.max(0, chopT - dt);
      fireT = Math.max(0, fireT - dt);
      const walk = moving ? Math.sin(phase) : 0;
      const idle = moving ? 0 : Math.sin(phase * 0.55) * 0.025;
      apply(thighL, walk * 0.7, 0, 0);
      apply(thighR, -walk * 0.7, 0, 0);
      apply(calfL, Math.max(0, -walk) * 0.5, 0, 0);
      apply(calfR, Math.max(0, walk) * 0.5, 0, 0);
      apply(spine, idle, 0, idle * 0.35);

      let armRx = -walk * 0.55;
      let armLx = walk * 0.55;
      let armRz = -APOSE;
      let armLz = APOSE;
      let low = 0.38;
      if (chopT > 0) {
        const u = 1 - chopT / 0.32;
        const swing =
          u < 0.45
            ? THREE.MathUtils.lerp(0, -1.35, u / 0.45)
            : THREE.MathUtils.lerp(-1.35, 1.15, (u - 0.45) / 0.55);
        armRx = swing;
        armRz = 0;
        low = u < 0.45 ? 0.4 : 0.9;
      } else if (fireT > 0) {
        armRx = -0.55;
        armRz = -0.18;
        low = 0.85 + Math.sin((1 - fireT / 0.16) * Math.PI) * 0.25;
      }
      apply(armL, armLx, 0, armLz + idle);
      apply(armR, armRx, 0, armRz);
      apply(lowL, low * 0.55, 0, 0);
      apply(lowR, low, 0, 0);
    },
    hideHead: (hide) => {
      if (head) {
        head.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.visible = !hide;
        });
      }
      for (const m of hairMeshes) m.visible = !hide;
    },
    dispose: () => {
      wrap.removeFromParent();
    },
  };
}

export async function loadCharacterPreview(charId: string): Promise<THREE.Group> {
  const rig = await loadCharacter(charId, 1.7);
  return rig.wrap;
}
