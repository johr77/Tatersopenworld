"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { consumeLook, edges, initInput, mouse, sampleActions, setForcedKeys, settings } from "./input";
import { gameState } from "./state";
import { playChop, playEmpty, playGunshot, playImpact, playSwoosh, playTreeFall } from "./audio";
import { collectStone, collectStrand, collectWood } from "./inventory";
import { saveCurrentInventory } from "./profiles";
import { resolveCircle } from "./world-data";
import { bumpBuild, cycleTray, nudgeCursor, pickBuilding, PIECES, placeCurrent, requestDelete, rotatePiece, setBuildMode, setPiece, TRAY_DELETE, TRAY_DONE } from "./build";
import { nearestStash, nearestToolTarget, nearestUseTarget, TREE_CHOP_RANGE, WEED_PICK_RANGE } from "./tools";
import { attachWeapons, WEAPONS, type WeaponHandle, type WeaponId } from "./weapon";
import { isFemaleLook, lookDef, LOOKS, type LookId } from "./profiles";
import { applyHairVisibility, applyHeadOnly, applyLoadout, installHeadOnly, isHairMesh, isHeadMesh, OUTFIT_FILES, wearOutfits } from "./wardrobe";

for (const row of LOOKS) useGLTF.preload(row.file);
useGLTF.preload("/models/ual2.glb");
useGLTF.preload(OUTFIT_FILES.male.peasant);
useGLTF.preload(OUTFIT_FILES.male.ranger);
useGLTF.preload(OUTFIT_FILES.female.peasant);
useGLTF.preload(OUTFIT_FILES.female.ranger);

const WALK_SPEED = 3.2;
const SPRINT_SPEED = 7.4;
const CROUCH_SPEED = 1.7;
const ACCEL = 22;
const AIR_ACCEL = 6;
const FRICTION = 12;
const GRAVITY = 20;
const JUMP_V = 9.0;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.05;
const SENS = 0.00205;
const PITCH_LIM = Math.PI / 2 - 0.04;
const PLAYER_R = 0.32;

const _eyePos = new THREE.Vector3();
const _adsPos = new THREE.Vector3();
const _eyeQ = new THREE.Quaternion();
const _sightO = new THREE.Vector3();
const _sightB = new THREE.Vector3();
const _sightU = new THREE.Vector3();
const _chopFrom = new THREE.Vector3();


function heldWeaponId(): WeaponId | null {
  const eq = gameState.equipment;
  if (gameState.hands === "weapon" && eq.weapon?.id === "pistol") return "pistol";
  if (gameState.hands === "weapon2" && eq.weapon2?.id === "shotgun") return "shotgun";
  return null;
}

function heldDef() {
  const id = heldWeaponId();
  return id ? WEAPONS.find((w) => w.id === id) ?? null : null;
}

const CLIP = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  jog: "Jog_Fwd_Loop",
  sprint: "Sprint_Loop",
  crouchIdle: "Crouch_Idle_Loop",
  crouchWalk: "Crouch_Fwd_Loop",
  jumpStart: "Jump_Start",
  jumpLoop: "Jump_Loop",
  jumpLand: "Jump_Land",
  shoot: "Pistol_Shoot",
  chop: "TreeChopping_Loop",
  pick: "Farm_Harvest",
  reload: "Pistol_Reload",
  aim: "Pistol_Aim_Neutral",
  aimUp: "Pistol_Aim_Up",
  aimDown: "Pistol_Aim_Down",
  pistolIdle: "Pistol_Idle_Loop",
};

type MixerAction = THREE.AnimationAction;

const LOWER_RE = /^(root|pelvis|spine_01|thigh_|calf_|foot_|ball_)/;
const LOCOMO = new Set([CLIP.walk, CLIP.jog, CLIP.sprint, CLIP.crouchWalk]);

function makeLayer(map: Map<string, MixerAction>, onPlay?: () => void) {
  let current = "";
  let backpedal = false;
  const applyScale = () => {
    const a = current ? map.get(current) : undefined;
    if (!a) return;
    a.setEffectiveTimeScale(backpedal && LOCOMO.has(current) ? -1 : 1);
  };
  return {
    get current() {
      return current;
    },
    play(name: string, fade = 0.16, restart = false) {
      onPlay?.();
      if (name === current && !restart) return;
      const next = map.get(name);
      if (!next) return;
      const prev = current && name !== current ? map.get(current) : undefined;
      next.reset().fadeIn(fade).play();
      prev?.fadeOut(fade);
      current = name;
      applyScale();
    },
    clear() {
      current = "";
    },
    setBackpedal(back: boolean) {
      if (back === backpedal) return;
      backpedal = back;
      applyScale();
    },
    get(name: string) {
      return map.get(name);
    },
  };
}

function makeController(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
  const mixer = new THREE.AnimationMixer(root);
  const lowerActs = new Map<string, MixerAction>();
  const upperActs = new Map<string, MixerAction>();
  for (const clip of clips) {
    const lowerTracks = clip.tracks.filter((t) => LOWER_RE.test(t.name.split(".")[0]));
    const upperTracks = clip.tracks.filter((t) => !LOWER_RE.test(t.name.split(".")[0]));
    const loop = /Loop$/.test(clip.name);
    if (lowerTracks.length) {
      const a = mixer.clipAction(new THREE.AnimationClip(`${clip.name}|L`, clip.duration, lowerTracks));
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.enabled = true;
      lowerActs.set(clip.name, a);
    }
    if (upperTracks.length) {
      const a = mixer.clipAction(new THREE.AnimationClip(`${clip.name}|U`, clip.duration, upperTracks));
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.enabled = true;
      upperActs.set(clip.name, a);
    }
  }

  const aimDown = upperActs.get(CLIP.aimDown);
  const aimNeu = upperActs.get(CLIP.aim);
  const aimUp = upperActs.get(CLIP.aimUp);
  let aimingBlend = false;

  const stopAimBlend = () => {
    if (!aimingBlend) return;
    aimingBlend = false;
    aimDown?.fadeOut(0.1);
    aimNeu?.fadeOut(0.1);
    aimUp?.fadeOut(0.1);
  };

  const lower = makeLayer(lowerActs);
  const upper = makeLayer(upperActs, stopAimBlend);

  return {
    mixer,
    lower,
    upper,
    setAimPitch(pitch: number) {
      if (!aimDown || !aimNeu || !aimUp) {
        upper.play(CLIP.aim, 0.1);
        return;
      }
      if (!aimingBlend) {
        aimingBlend = true;
        const prev = upper.current ? upperActs.get(upper.current) : undefined;
        prev?.fadeOut(0.1);
        upper.clear();
        for (const a of [aimDown, aimNeu, aimUp]) {
          a.enabled = true;
          a.reset();
          a.setLoop(THREE.LoopRepeat, Infinity);
          a.setEffectiveWeight(0);
          a.play();
        }
      }
      const t = THREE.MathUtils.clamp(pitch / 1.15, -1, 1);
      // pitch > 0 is look up (mouse up raises the crosshair).
      const wUp = Math.max(0, t);
      const wDown = Math.max(0, -t);
      aimDown.setEffectiveWeight(wDown);
      aimNeu.setEffectiveWeight(1 - wDown - wUp);
      aimUp.setEffectiveWeight(wUp);
    },
  };
}

function resetBind(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh && mesh.skeleton) mesh.skeleton.pose();
  });
}

function poseIdle(controller: ReturnType<typeof makeController>, root: THREE.Object3D) {
  controller.lower.play(CLIP.idle, 0, true);
  controller.upper.play(CLIP.idle, 0, true);
  const jump = (layer: { get: (n: string) => MixerAction | undefined }) => {
    const a = layer.get(CLIP.idle);
    if (!a) return;
    const dur = a.getClip().duration || 1;
    a.time = Math.min(0.28, dur * 0.2);
  };
  jump(controller.lower);
  jump(controller.upper);
  controller.mixer.update(1 / 30);
  root.updateMatrixWorld(true);
}

function cloneMats(mesh: THREE.Mesh) {
  if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => m.clone());
  else mesh.material = mesh.material.clone();
}

function prepBaseMesh(m: THREE.Mesh) {
  if (isHeadMesh(m) || isHairMesh(m) || m.name.startsWith("Hit_")) return;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  for (const raw of mats) {
    const mat = raw as THREE.MeshStandardMaterial;
    if (mat) installHeadOnly(mat);
  }
}

function dressCharacter(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    cloneMats(m);
    prepBaseMesh(m);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const raw of mats) {
      const mat = raw as THREE.MeshStandardMaterial;
      if (!mat) continue;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      if (mat.normalMap) mat.normalMap.colorSpace = THREE.LinearSRGBColorSpace;
      if (mat.metalnessMap) mat.metalnessMap.colorSpace = THREE.LinearSRGBColorSpace;
      if (mat.roughnessMap) mat.roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;
    }
  });
}

function paintMannequin(root: THREE.Object3D, female: boolean) {
  const body = female ? "#d2b48c" : "#c9b89a";
  const joints = female ? "#4a3f38" : "#2f3b34";
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    cloneMats(m);
    prepBaseMesh(m);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const raw of mats) {
      const mat = raw as THREE.MeshStandardMaterial;
      if (!mat) continue;
      const n = (mat.name || "").toLowerCase();
      if (n.includes("joint") || n.includes("dark") || n.includes("black")) mat.color.set(joints);
      else mat.color.set(body);
    }
  });
}

export function Player() {
  const { camera, gl, scene } = useThree();
  const [look, setLook] = useState<LookId>(gameState.look);
  const maleGltf = useGLTF("/models/character.glb");
  const ual2 = useGLTF("/models/ual2.glb");
  const femaleGltf = useGLTF("/models/character_f.glb");
  const heroMaleGltf = useGLTF("/models/characters/Superhero_Male_FullBody.gltf");
  const heroFemaleGltf = useGLTF("/models/characters/Superhero_Female_FullBody.gltf");
  const malePeasant = useGLTF(OUTFIT_FILES.male.peasant);
  const maleRanger = useGLTF(OUTFIT_FILES.male.ranger);
  const femalePeasant = useGLTF(OUTFIT_FILES.female.peasant);
  const femaleRanger = useGLTF(OUTFIT_FILES.female.ranger);
  const scenes = {
    mannequin: maleGltf,
    female: femaleGltf,
    "hero-male": heroMaleGltf,
    "hero-female": heroFemaleGltf,
  } as const;
  const gltf = scenes[look] ?? maleGltf;
  const female = isFemaleLook(look);
  const body = useMemo(() => {
    const b = cloneSkinned(gltf.scene);
    resetBind(b);
    if (lookDef(look).paint) paintMannequin(b, isFemaleLook(look));
    else dressCharacter(b);
    const meshes: THREE.Mesh[] = [];
    b.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) meshes.push(m);
    });
    b.updateMatrixWorld(true);
    applyHeadOnly(meshes);
    return b;
  }, [gltf.scene, look]);
  const controller = useMemo(() => {
    const c = makeController(body, [...maleGltf.animations, ...ual2.animations]);
    poseIdle(c, body);
    return c;
  }, [body, maleGltf.animations, ual2.animations]);
  const clothes = useRef<THREE.SkinnedMesh[]>([]);
  const baseMeshes = useRef<THREE.Mesh[]>([]);
  const plantBox = useRef(new THREE.Box3());
  const footLift = useRef(0);
  const headBone = useRef<THREE.Object3D | null>(null);
  const neckBone = useRef<THREE.Object3D | null>(null);
  const handBone = useRef<THREE.Object3D | null>(null);
  const lastFov = useRef(70);
  const lastNear = useRef(0.08);
  const landHold = useRef(0);
  const stickLookLatch = useRef(false);
  const wasAiming = useRef(false);
  const alignCam = useRef(false);
  const alignDist = useRef(0.7);
  const adsBlend = useRef(0);
  const buildHold = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (gameState.look !== look) setLook(gameState.look);
    }, 120);
    return () => clearInterval(id);
  }, [look]);

  const yaw = useRef(0);
  const pitch = useRef(0);
  const orbitYaw = useRef(0);
  const orbitPitch = useRef(0);
  const pos = useRef(new THREE.Vector3(0, 0, 12));
  const vel = useRef(new THREE.Vector3());
  const vy = useRef(0);
  const grounded = useRef(true);
  const coyote = useRef(0);
  const jumpBuf = useRef(0);
  const view = useRef<"fps" | "third">("third");
  const eye = useRef(EYE_STAND);
  const bob = useRef(0);
  const recoil = useRef(0);
  const fireCd = useRef(0);
  const reloadT = useRef(0);
  const ammo = useRef(WEAPONS[1].mag);
  const reserve = useRef(WEAPONS[1].reserve);
  const lastHeld = useRef<WeaponId | null>(null);
  const shootHold = useRef(0);
  const pickHold = useRef(0);
  const chopHold = useRef(0);
  const flash = useRef(0);
  const camPos = useRef(new THREE.Vector3(0, 1.6, 14));
  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const wish = useRef(new THREE.Vector3());
  const camFwd = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const ray = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2(0, 0));
  const viewmodel = useRef<WeaponHandle | null>(null);
  const muzzle = useRef<THREE.PointLight>(null);
  const weapons = useRef<WeaponHandle | null>(null);
  const wasMenu = useRef(true);

  useEffect(() => {
    initInput();
    controller.mixer.stopAllAction();
    resetBind(body);
    for (const mesh of clothes.current) mesh.removeFromParent();
    baseMeshes.current = [];
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) baseMeshes.current.push(m);
    });
    clothes.current = wearOutfits(body, female ? [femalePeasant.scene, femaleRanger.scene] : [malePeasant.scene, maleRanger.scene]);
    applyLoadout(clothes.current, gameState.loadout);
    applyHairVisibility(baseMeshes.current, gameState.loadout.head === "ranger");
    poseIdle(controller, body);
    plantBox.current.setFromObject(body);
    footLift.current = Number.isFinite(plantBox.current.min.y) ? -plantBox.current.min.y : 0;
    headBone.current = body.getObjectByName("Head") ?? null;
    neckBone.current = body.getObjectByName("neck_01") ?? null;
    const hand = body.getObjectByName("hand_r");
    handBone.current = hand ?? null;
    const hitHead = body.getObjectByName("Hit_Head");
    const hitChest = body.getObjectByName("Hit_Chest");
    if (hitHead) hitHead.visible = false;
    if (hitChest) hitChest.visible = false;
    weapons.current = hand ? attachWeapons(hand) : null;
    if (weapons.current) {
      weapons.current.root.renderOrder = 5;
      weapons.current.root.traverse((o) => {
        o.renderOrder = 5;
      });
    }
    weapons.current?.setId(heldWeaponId());
    lastHeld.current = heldWeaponId();

    window.__controlsTest = {
      getYaw: () => yaw.current,
      getBodyYaw: () => yaw.current,
      getSpeed: () => gameState.speed,
      getPosition: () => ({ x: pos.current.x, y: pos.current.y, z: pos.current.z }),
      getAnimScale: () => {
        const a = controller.lower.get(controller.lower.current);
        return a?.timeScale ?? 1;
      },
      setKeys: (codes) => setForcedKeys(codes.length ? codes : null),
      setFire: (v: boolean) => {
        mouse.fireHeld = v;
      },
      setAim: (v: boolean) => {
        mouse.aimHeld = v;
      },
      setView: (mode: "fps" | "third") => {
        view.current = mode;
      },
      setLook: (y: number, p: number) => {
        yaw.current = y;
        pitch.current = p;
      },
      setAlign: (v: boolean) => {
        alignCam.current = v;
        if (v) {
          view.current = "third";
          orbitYaw.current = 0.55;
          orbitPitch.current = 0.18;
          alignDist.current = 1.15;
        } else {
          orbitYaw.current = 0;
          orbitPitch.current = 0;
        }
      },
      getWeapon: () => gameState.weapon,
      setSlot: (i: number) => {
        gameState.hands = i === 1 ? "weapon2" : "weapon";
      },
      getLook: () => gameState.look,
      getDebug: () => ({
        look,
        hand: Boolean(body.getObjectByName("hand_r")),
        gunKids: weapons.current?.children() ?? 0,
        vmKids: viewmodel.current?.children() ?? 0,
        clip: `${controller.lower.current} / ${controller.upper.current}`,
      }),
    };

    gameState.ready = true;
    gameState.weapon = heldDef()?.name ?? "—";
    return () => {
      weapons.current?.dispose();
      weapons.current = null;
    };
  }, [body, camera, controller, look, female, femalePeasant.scene, femaleRanger.scene, malePeasant.scene, maleRanger.scene]);

  useEffect(() => {
    return () => {
      if (viewmodel.current) {
        viewmodel.current.dispose();
        camera.remove(viewmodel.current.root);
        viewmodel.current = null;
      }
      delete window.__controlsTest;
    };
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;
    const onLock = () => {
      mouse.locked = document.pointerLockElement === el;
      gameState.locked = mouse.locked;
    };
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, [gl]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const actions = sampleActions();
    if (edges.toggleView && !gameState.buildMode) view.current = view.current === "fps" ? "third" : "fps";
    if (edges.alignCam && !gameState.buildMode) {
      alignCam.current = !alignCam.current;
      if (alignCam.current) {
        view.current = "third";
        orbitYaw.current = 0.55;
        orbitPitch.current = 0.18;
        alignDist.current = 1.15;
      } else {
        orbitYaw.current = 0;
        orbitPitch.current = 0;
      }
    }
    if (view.current === "fps") alignCam.current = false;
    else adsBlend.current = 0;
    if (actions.weaponSlot === 0 && gameState.equipment.weapon) gameState.hands = "weapon";
    if (actions.weaponSlot === 1 && gameState.equipment.weapon2) gameState.hands = "weapon2";
    if (!gameState.buildMode && (edges.nextWeapon || edges.prevWeapon)) {
      const guns: Array<"weapon" | "weapon2"> = [];
      if (gameState.equipment.weapon) guns.push("weapon");
      if (gameState.equipment.weapon2) guns.push("weapon2");
      if (guns.length) {
        const i = Math.max(0, guns.indexOf(gameState.hands as "weapon" | "weapon2"));
        const n = edges.nextWeapon ? 1 : guns.length - 1;
        gameState.hands = guns[(i + n) % guns.length]!;
      }
    }
    const held = heldWeaponId();
    const building = gameState.buildMode;
    if (building) {
      view.current = "third";
      alignCam.current = false;
      if (gameState.buildPending < 0) {
        if (edges.nextWeapon) cycleTray(1);
        if (edges.prevWeapon) cycleTray(-1);
        if (edges.use) rotatePiece();
        if (edges.crouch) setBuildMode(false);
        const focus = gameState.buildFocus;
        const deleting = gameState.buildTool === "delete" || focus === TRAY_DELETE;
        if (edges.jump) {
          if (focus === TRAY_DONE) setBuildMode(false);
          else if (deleting) {
            gameState.buildTool = "delete";
            gameState.buildFocus = TRAY_DELETE;
            bumpBuild();
            const i = pickBuilding(camera, scene);
            if (i >= 0) requestDelete(i);
          } else {
            const piece = PIECES[focus];
            if (piece) setPiece(piece.id);
            if (placeCurrent()) saveCurrentInventory();
          }
        }
        if (edges.fire && mouse.fireHeld) {
          if (deleting) {
            const i = pickBuilding(camera, scene);
            if (i >= 0) requestDelete(i);
          } else if (placeCurrent()) saveCurrentInventory();
        }
      }
      if (gameState.buildTool === "delete" && gameState.buildPending < 0) {
        gameState.buildHover = pickBuilding(camera, scene);
      } else if (gameState.buildPending >= 0) gameState.buildHover = gameState.buildPending;
      else gameState.buildHover = -1;
    }
    if (held !== lastHeld.current) {
      lastHeld.current = held;
      if (chopHold.current <= 0) weapons.current?.setId(held);
      viewmodel.current?.setId(held);
      const def = heldDef();
      if (def && !def.melee) {
        ammo.current = def.mag;
        reserve.current = def.reserve;
        reloadT.current = 0;
      }
      gameState.weapon = def?.name ?? "—";
    }

    const lookDelta = consumeLook();
    const third = view.current === "third";
    const aiming = actions.aim && !building;
    const mouseSens = SENS * settings.mouseSens * (aiming ? 0.55 : 1);
    const stickRate = 2.35 * settings.stickSens;
    const stickHeld = Math.hypot(actions.lookStickX, actions.lookStickY) > 0.12;
    const inspecting = alignCam.current;

    if (building) {
      if (mouse.locked) {
        orbitYaw.current -= lookDelta.dx * mouseSens;
        orbitPitch.current -= lookDelta.dy * mouseSens;
      }
      orbitYaw.current -= actions.lookStickX * stickRate * dt;
      orbitPitch.current -= actions.lookStickY * 1.9 * settings.stickSens * dt;
    } else if (inspecting) {
      if (mouse.locked) {
        orbitYaw.current -= lookDelta.dx * mouseSens * 1.7;
        orbitPitch.current -= lookDelta.dy * mouseSens * 1.7;
      }
      orbitYaw.current -= actions.lookStickX * 2.5 * dt;
      orbitPitch.current -= actions.lookStickY * 2.1 * dt;
      alignDist.current = THREE.MathUtils.clamp(
        alignDist.current - actions.moveY * 1.35 * dt,
        0.4,
        2.4,
      );
    } else if (third && actions.freeLook && mouse.locked) {
      orbitYaw.current -= lookDelta.dx * mouseSens;
      orbitPitch.current -= lookDelta.dy * mouseSens;
    } else {
      if (mouse.locked) {
        yaw.current -= lookDelta.dx * mouseSens;
        pitch.current -= lookDelta.dy * mouseSens;
      }
      yaw.current -= actions.lookStickX * stickRate * dt;
      pitch.current -= actions.lookStickY * 1.9 * settings.stickSens * dt;
      orbitYaw.current = THREE.MathUtils.damp(orbitYaw.current, 0, 12, dt);
      orbitPitch.current = THREE.MathUtils.damp(orbitPitch.current, 0, 12, dt);
    }

    if (stickHeld && !building) stickLookLatch.current = true;
    if (aiming) {
      wasAiming.current = true;
      stickLookLatch.current = false;
    }
    if (third && !aiming && !inspecting && !building && !stickHeld && (stickLookLatch.current || wasAiming.current)) {
      pitch.current = THREE.MathUtils.damp(pitch.current, 0, 8, dt);
      if (Math.abs(pitch.current) < 0.025) {
        pitch.current = 0;
        stickLookLatch.current = false;
        wasAiming.current = false;
      }
    }

    pitch.current = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, pitch.current));
    orbitPitch.current = inspecting
      ? Math.max(-1.2, Math.min(1.2, orbitPitch.current))
      : Math.max(-0.9, Math.min(0.7, orbitPitch.current));

    const lookYaw = yaw.current + orbitYaw.current;
    const lookPitch = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, pitch.current + orbitPitch.current));

    const sy = Math.sin(yaw.current);
    const cy = Math.cos(yaw.current);
    fwd.current.set(-sy, 0, -cy);
    right.current.set(cy, 0, -sy);
    const ly = Math.sin(lookYaw);
    const lc = Math.cos(lookYaw);
    camFwd.current.set(-ly, 0, -lc);

    if (building && gameState.buildPending < 0) {
      const mx = actions.moveX;
      const my = actions.moveY;
      if (Math.hypot(mx, my) > 0.45) {
        buildHold.current -= dt;
        if (buildHold.current <= 0) {
          const wx = camFwd.current.x * my + lc * mx;
          const wz = camFwd.current.z * my - ly * mx;
          if (Math.abs(wx) >= Math.abs(wz)) nudgeCursor(Math.sign(wx), 0);
          else nudgeCursor(0, Math.sign(wz));
          buildHold.current = 0.16;
        }
      } else {
        buildHold.current = 0;
      }
    }

    const wantCrouch = actions.crouch && grounded.current && !building;
    const maxSpeed = wantCrouch
      ? CROUCH_SPEED
      : actions.sprint && actions.moveY > 0
        ? SPRINT_SPEED
        : WALK_SPEED;

    wish.current.copy(fwd.current).multiplyScalar(actions.moveY).addScaledVector(right.current, actions.moveX);
    if (inspecting || building || pickHold.current > 0 || chopHold.current > 0) wish.current.set(0, 0, 0);
    if (wish.current.lengthSq() > 1) wish.current.normalize();

    if (inspecting || building || pickHold.current > 0 || chopHold.current > 0) {
      vel.current.x = 0;
      vel.current.z = 0;
    }
    const accel = grounded.current ? ACCEL : AIR_ACCEL;
    if (wish.current.lengthSq() > 0.0001) {
      vel.current.x += wish.current.x * accel * dt;
      vel.current.z += wish.current.z * accel * dt;
    } else if (grounded.current) {
      const drop = Math.max(0, 1 - FRICTION * dt);
      vel.current.x *= drop;
      vel.current.z *= drop;
    }
    const sp = Math.hypot(vel.current.x, vel.current.z);
    if (sp > maxSpeed) {
      vel.current.x *= maxSpeed / sp;
      vel.current.z *= maxSpeed / sp;
    }

    if (edges.jump && !building && !inspecting && pickHold.current <= 0 && chopHold.current <= 0) jumpBuf.current = 0.12;
    else jumpBuf.current = Math.max(0, jumpBuf.current - dt);
    if (grounded.current) coyote.current = 0.12;
    else coyote.current = Math.max(0, coyote.current - dt);

    if (jumpBuf.current > 0 && coyote.current > 0) {
      vy.current = JUMP_V;
      grounded.current = false;
      coyote.current = 0;
      jumpBuf.current = 0;
      landHold.current = 0;
      controller.lower.play(CLIP.jumpStart, 0.05);
      controller.upper.play(CLIP.jumpStart, 0.05);
    }

    vy.current -= GRAVITY * dt;
    pos.current.y += vy.current * dt;
    if (pos.current.y <= 0) {
      pos.current.y = 0;
      if (!grounded.current) {
        controller.lower.play(CLIP.jumpLand, 0.05);
        controller.upper.play(CLIP.jumpLand, 0.05);
        landHold.current = 0.28;
      }
      vy.current = 0;
      grounded.current = true;
    } else {
      grounded.current = false;
    }

    pos.current.x += vel.current.x * dt;
    pos.current.z += vel.current.z * dt;
    const resolved = resolveCircle(pos.current.x, pos.current.z, PLAYER_R);
    pos.current.x = resolved.x;
    pos.current.z = resolved.z;

    const xz = Math.hypot(vel.current.x, vel.current.z);
    const def = heldDef();
    fireCd.current = Math.max(0, fireCd.current - dt);
    if (reloadT.current > 0) {
      reloadT.current -= dt;
      if (reloadT.current <= 0 && def) {
        const need = def.mag - ammo.current;
        const take = Math.min(need, reserve.current);
        ammo.current += take;
        reserve.current -= take;
      }
    }
    if (edges.reload && !gameState.buildMode && def && !def.melee && reloadT.current <= 0 && ammo.current < def.mag && reserve.current > 0) {
      reloadT.current = def.reload;
      controller.upper.play(CLIP.reload, 0.08);
    }
    if (edges.fire && !gameState.buildMode && reloadT.current <= 0) {
      if (!def || def.melee) {
        playEmpty();
      } else if (ammo.current <= 0) playEmpty();
      else if (fireCd.current <= 0) {
        ammo.current -= 1;
        fireCd.current = def.fireCd;
        recoil.current += def.recoil;
        flash.current = 0.05;
        shootHold.current = 0.28;
        playGunshot(def.id);
        controller.upper.play(CLIP.shoot, 0.04);
        ray.current.layers.set(1);
        ray.current.setFromCamera(ndc.current, camera);
        const hits = ray.current.intersectObjects(scene.children, true);
        const hit = hits.find((h) => {
          let o: THREE.Object3D | null = h.object;
          while (o) {
            if (o === body || o === viewmodel.current?.root) return false;
            o = o.parent;
          }
          return h.distance > 0.4;
        });
        if (hit) {
          playImpact();
          let o: THREE.Object3D | null = hit.object;
          while (o) {
            if (o.userData?.target) {
              if (!o.userData.down) {
                gameState.hits += 1;
                o.userData.knock?.();
              }
              break;
            }
            o = o.parent;
          }
        }
      }
    }
    shootHold.current = Math.max(0, shootHold.current - dt);
    recoil.current = THREE.MathUtils.damp(recoil.current, 0, 8, dt);
    flash.current = Math.max(0, flash.current - dt);

    const moving = xz > 0.35 && grounded.current;
    const fps = view.current === "fps";
    weapons.current?.setLowered(!aiming && shootHold.current <= 0);

    const chopping = chopHold.current > 0;
    const picking = pickHold.current > 0;
    if (picking) pickHold.current = Math.max(0, pickHold.current - dt);
    if (chopping) {
      chopHold.current = Math.max(0, chopHold.current - dt);
      if (chopHold.current <= 0) weapons.current?.setId(heldWeaponId());
    }
    let loco = CLIP.idle;
    if (!grounded.current) {
      controller.lower.setBackpedal(false);
      if (vy.current > 0.2) controller.lower.play(CLIP.jumpStart, 0.06);
      else controller.lower.play(CLIP.jumpLoop, 0.1);
    } else if (landHold.current > 0 && !moving) {
      landHold.current = Math.max(0, landHold.current - dt);
      controller.lower.play(CLIP.jumpLand, 0.05);
    } else if (chopping) {
      controller.lower.play(CLIP.chop, 0.08);
      controller.lower.setBackpedal(false);
    } else if (picking) {
      controller.lower.play(CLIP.pick, 0.08);
      controller.lower.setBackpedal(false);
    } else {
      landHold.current = 0;
      if (wantCrouch && moving) loco = CLIP.crouchWalk;
      else if (wantCrouch) loco = CLIP.crouchIdle;
      else if (actions.sprint && moving && actions.moveY > 0.2) loco = CLIP.sprint;
      else if (moving && xz > 4.2) loco = CLIP.jog;
      else if (moving) loco = CLIP.walk;
      else loco = CLIP.idle;
      controller.lower.play(loco);
      controller.lower.setBackpedal(moving && actions.moveY < -0.12);
    }

    if (reloadT.current > 0) controller.upper.play(CLIP.reload, 0.08);
    else if (chopping) controller.upper.play(CLIP.chop, 0.08);
    else if (picking) controller.upper.play(CLIP.pick, 0.08);
    else if (shootHold.current > 0) controller.upper.play(CLIP.shoot, 0.05);
    else if (aiming || fps) controller.setAimPitch(pitch.current + recoil.current);
    else if (!grounded.current) {
      if (vy.current > 0.2) controller.upper.play(CLIP.jumpStart, 0.06);
      else controller.upper.play(CLIP.jumpLoop, 0.1);
    } else if (landHold.current > 0 && !moving) controller.upper.play(CLIP.jumpLand, 0.05);
    else {
      controller.upper.play(loco, 0.14);
      controller.upper.setBackpedal(moving && actions.moveY < -0.12);
    }

    const lowerLabel = controller.lower.current.replaceAll("_", " ").replace(/ Loop$/, "");
    const upperLabel = controller.upper.current.replaceAll("_", " ").replace(/ Loop$/, "");
    const combat = reloadT.current > 0 || shootHold.current > 0 || aiming;
    gameState.clip = combat ? `${lowerLabel} · ${upperLabel}` : lowerLabel;

    controller.mixer.update(dt);

    const targetEye = wantCrouch ? EYE_CROUCH : EYE_STAND;
    eye.current = THREE.MathUtils.damp(eye.current, targetEye, 10, dt);
    if (moving) bob.current += dt * xz * 1.6;
    const bobY = moving ? Math.sin(bob.current) * 0.035 : 0;

    const inMenu = !gameState.playing;
    if (inMenu) {
      wasMenu.current = true;
    } else if (wasMenu.current) {
      wasMenu.current = false;
      pitch.current = 0.08;
      orbitYaw.current = 0;
      orbitPitch.current = 0;
      adsBlend.current = 0;
      camPos.current.set(pos.current.x, pos.current.y + 1.7, pos.current.z + 4.2);
    }
    const spinning = inMenu && gameState.setup;
    const bodyYaw = spinning ? state.clock.elapsedTime * 0.55 : inMenu ? 0 : yaw.current + Math.PI;
    body.position.set(pos.current.x, pos.current.y + footLift.current, pos.current.z);
    body.rotation.order = "YXZ";
    body.rotation.y = bodyYaw;
    body.updateMatrixWorld(true);
    applyLoadout(clothes.current, gameState.loadout);
    applyHairVisibility(baseMeshes.current, gameState.loadout.head === "ranger");

    const head = headBone.current;
    const neck = neckBone.current;
    const hideSkull = !inMenu && fps;
    if (head) head.scale.setScalar(hideSkull ? 0.01 : 1);
    if (neck) neck.scale.setScalar(hideSkull ? 0.01 : 1);
    body.visible = true;
    if (weapons.current) weapons.current.root.visible = !inMenu && (Boolean(heldWeaponId()) || chopHold.current > 0);
    if (viewmodel.current) viewmodel.current.root.visible = false;
    if (muzzle.current) muzzle.current.intensity = flash.current > 0 ? 18 : 0;

    const persp = camera as THREE.PerspectiveCamera;
    let nextFov = 70;
    let nextNear = 0.08;
    if (inMenu) {
      if (gameState.setup) {
        persp.position.set(pos.current.x + 0.2, 1.32, pos.current.z + 3.15);
        persp.lookAt(pos.current.x - 0.35, 0.92, pos.current.z);
        nextFov = 34;
      } else {
        persp.position.set(pos.current.x + 2.15, 1.45, pos.current.z + 3.6);
        persp.lookAt(pos.current.x, 0.92, pos.current.z);
        nextFov = 38;
      }
    } else if (fps) {
      adsBlend.current = THREE.MathUtils.damp(adsBlend.current, aiming && def && !def.melee ? 1 : 0, 12, dt);
      const t = adsBlend.current;
      persp.rotation.order = "YXZ";
      persp.rotation.y = yaw.current;
      persp.rotation.x = pitch.current + recoil.current * (1 - t * 0.4);
      persp.rotation.z = 0;
      _eyeQ.setFromEuler(persp.rotation);

      const down = Math.max(0, -pitch.current);
      _eyePos.set(pos.current.x, pos.current.y + eye.current + bobY * (1 - t), pos.current.z);
      _eyePos.addScaledVector(camFwd.current, 0.14 + down * 0.7 * (1 - t));
      persp.position.copy(_eyePos);
      persp.quaternion.copy(_eyeQ);

      const lookDir = wish.current;
      lookDir.set(0, 0, -1).applyQuaternion(_eyeQ);
      lookTarget.current.copy(_eyePos).addScaledVector(lookDir, 24);

      if (t > 0.001 && weapons.current && def && !def.melee) {
        body.updateMatrixWorld(true);
        weapons.current.aimAt(lookTarget.current, t);
        weapons.current.sight(_sightO, _sightB, _sightU);
        _adsPos.copy(_sightO).addScaledVector(lookDir, -def.adsBack).addScaledVector(_sightU, def.adsUp);
        persp.position.lerp(_adsPos, t);
      }
      nextFov = 72 - t * 34;
      nextNear = t > 0.35 ? 0.04 : 0.08;
    } else if (alignCam.current) {
      const hand = handBone.current;
      if (hand) {
        body.updateMatrixWorld(true);
        lookTarget.current.set(0, 0.08, 0);
        hand.localToWorld(lookTarget.current);
      } else {
        lookTarget.current.copy(pos.current);
        lookTarget.current.y += 1.05;
      }
      const ay = orbitYaw.current;
      const ap = orbitPitch.current;
      const d = alignDist.current;
      const cp = Math.cos(ap);
      const desired = wish.current;
      desired.set(Math.sin(ay) * cp * d, Math.sin(ap) * d, Math.cos(ay) * cp * d);
      desired.add(lookTarget.current);
      camPos.current.lerp(desired, 1 - Math.exp(-14 * dt));
      persp.position.copy(camPos.current);
      persp.lookAt(lookTarget.current);
      nextFov = 34;
      nextNear = 0.04;
    } else {
      const dist = 3.6;
      const height = 1.55;
      const shoulder = 0.55;
      const desired = wish.current;
      desired.set(-ly, 0, -lc).multiplyScalar(-dist);
      desired.x += lc * shoulder;
      desired.z += -ly * shoulder;
      desired.y += height;
      desired.add(pos.current);
      camPos.current.lerp(desired, 1 - Math.exp(-10 * dt));
      persp.position.copy(camPos.current);
      lookTarget.current.copy(pos.current);
      lookTarget.current.y += eye.current * 0.85;
      lookTarget.current.addScaledVector(camFwd.current, 2.4);
      lookTarget.current.y += Math.sin(lookPitch) * 2.2;
      persp.lookAt(lookTarget.current);
      nextFov = 70;
    }
    const adsFps = Boolean(fps && aiming && def && !def.melee && adsBlend.current > 0.001);
    if (!alignCam.current && aiming && def && !def.melee && !adsFps) weapons.current?.aimAt(lookTarget.current);
    else if (!adsFps) weapons.current?.aimAt(null);
    if (persp.fov !== nextFov || persp.near !== nextNear) {
      persp.fov = nextFov;
      persp.near = nextNear;
      persp.updateProjectionMatrix();
      lastFov.current = nextFov;
      lastNear.current = nextNear;
    }

    gameState.yaw = yaw.current;
    gameState.x = pos.current.x;
    gameState.y = pos.current.y;
    gameState.z = pos.current.z;
    gameState.speed = xz;
    gameState.grounded = grounded.current;
    gameState.crouched = wantCrouch;
    gameState.sprinting = actions.sprint && moving && !wantCrouch;
    gameState.aiming = aiming;
    gameState.view = view.current;
    gameState.alignCam = alignCam.current;
    gameState.ammo = ammo.current;
    gameState.reserve = reserve.current;
    gameState.reloading = reloadT.current > 0;
    gameState.magSize = def?.mag ?? 0;
    gameState.pad = actions.padActive;
    const stash = nearestStash(scene, pos.current, fwd.current);
    const pickable = nearestUseTarget(scene, pos.current, fwd.current, WEED_PICK_RANGE);
    const axeReady = gameState.equipment.tool?.id === "axe";
    const tree = axeReady ? nearestToolTarget(scene, pos.current, fwd.current, "axe", TREE_CHOP_RANGE) : null;
    gameState.prompt = gameState.buildMode
      ? gameState.buildPending >= 0
        ? "A yes · B no"
        : gameState.buildTool === "delete"
          ? "Look at a piece · A delete · B exit"
          : "Left stick move piece · A place · X rotate · B exit"
      : stash
      ? "Open chest"
      : pickable?.userData.kind === "stone"
        ? "Pick stone"
        : pickable
          ? "Pick weed"
          : tree
            ? "Chop"
            : "";
    const busy = pickHold.current > 0 || chopHold.current > 0;
    if (edges.use && !busy && !gameState.buildMode) {
      if (stash) {
        stash.userData.use();
      } else if (pickable) {
        const ok = pickable.userData.use() as boolean;
        if (ok) {
          if (pickable.userData.kind === "stone") collectStone(gameState.inventory);
          else collectStrand(gameState.inventory);
          saveCurrentInventory();
          controller.lower.play(CLIP.pick, 0.06, true);
          controller.upper.play(CLIP.pick, 0.06, true);
          const clip = controller.upper.get(CLIP.pick)?.getClip() ?? controller.lower.get(CLIP.pick)?.getClip();
          const dur = clip?.duration || 1.1;
          pickHold.current = dur;
          pickable.userData.pull?.(dur * 0.48);
          pickable.getWorldPosition(_chopFrom);
          const dx = _chopFrom.x - pos.current.x;
          const dz = _chopFrom.z - pos.current.z;
          if (dx * dx + dz * dz > 0.25) yaw.current = Math.atan2(-dx, -dz);
        }
      } else if (tree) {
        tree.getWorldPosition(_chopFrom);
        const dx = _chopFrom.x - pos.current.x;
        const dz = _chopFrom.z - pos.current.z;
        yaw.current = Math.atan2(-dx, -dz);
        const horiz = Math.hypot(dx, dz) || 1;
        pitch.current = THREE.MathUtils.clamp(Math.atan2(1.15 - eye.current, horiz), -PITCH_LIM, PITCH_LIM);
        const r = tree.userData.chop() as "hit" | "fell" | "gone";
        if (r !== "gone") {
          weapons.current?.setId("axe");
          controller.lower.play(CLIP.chop, 0.05, true);
          controller.upper.play(CLIP.chop, 0.05, true);
          const clip = controller.upper.get(CLIP.chop)?.getClip() ?? controller.lower.get(CLIP.chop)?.getClip();
          chopHold.current = Math.min(1.05, clip?.duration || 0.95);
          playChop();
          if (r === "fell") {
            playTreeFall();
            if (collectWood(gameState.inventory)) saveCurrentInventory();
          }
        }
      }
    }
  });

  return (
    <group>
      <primitive object={body} />
      <pointLight ref={muzzle} color="#ffd9a0" distance={4} intensity={0} />
    </group>
  );
}
