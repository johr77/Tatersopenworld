"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { consumeLook, edges, initInput, mouse, sampleActions, setForcedKeys, settings } from "./input";
import { gameState } from "./state";
import { playEmpty, playGunshot, playImpact } from "./audio";
import { resolveCircle } from "./world-data";
import { attachWeapons, WEAPONS, type WeaponHandle } from "./weapon";
import { isFemaleLook, lookDef, LOOKS, type LookId } from "./profiles";
import { applyLoadout, installHeadOnly, isHeadMesh, OUTFIT_FILES, setHeadCutY, wearOutfits } from "./wardrobe";

for (const row of LOOKS) useGLTF.preload(row.file);
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
const _neckPos = new THREE.Vector3();


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
    play(name: string, fade = 0.16) {
      onPlay?.();
      if (name === current) return;
      const next = map.get(name);
      if (!next) return;
      const prev = current ? map.get(current) : undefined;
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

function cloneMats(mesh: THREE.Mesh) {
  if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => m.clone());
  else mesh.material = mesh.material.clone();
}

function prepBaseMesh(m: THREE.Mesh) {
  if (isHeadMesh(m) || m.name.startsWith("Hit_")) return;
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
  const selected = lookDef(look);
  const female = isFemaleLook(look);
  const body = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene, look]);
  const controller = useMemo(
    () => makeController(body, maleGltf.animations),
    [body, maleGltf.animations],
  );
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
  const alignCam = useRef(false);
  const alignDist = useRef(0.7);
  const adsBlend = useRef(0);

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
  const weaponI = useRef(1);
  const shootHold = useRef(0);
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
    if (selected.paint) paintMannequin(body, look === "female");
    else dressCharacter(body);
    for (const mesh of clothes.current) mesh.removeFromParent();
    baseMeshes.current = [];
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) baseMeshes.current.push(m);
    });
    clothes.current = wearOutfits(body, female ? [femalePeasant.scene, femaleRanger.scene] : [malePeasant.scene, maleRanger.scene]);
    applyLoadout(clothes.current, gameState.loadout);
    controller.lower.play(CLIP.idle, 0);
    controller.upper.play(CLIP.idle, 0);
    controller.mixer.update(0);
    body.updateMatrixWorld(true);
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
    weapons.current?.setId(WEAPONS[weaponI.current].id);

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
        weaponI.current = i;
        const def = WEAPONS[i];
        weapons.current?.setId(def.id);
        viewmodel.current?.setId(def.id);
        ammo.current = def.mag;
        reserve.current = def.reserve;
        gameState.weapon = def.name;
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
    gameState.weapon = WEAPONS[weaponI.current].name;
    return () => {
      weapons.current?.dispose();
      weapons.current = null;
    };
  }, [body, camera, controller, look, selected.paint, female, femalePeasant.scene, femaleRanger.scene, malePeasant.scene, maleRanger.scene]);

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
    if (edges.toggleView) view.current = view.current === "fps" ? "third" : "fps";
    if (edges.alignCam) {
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
    let nextSlot = weaponI.current;
    if (actions.weaponSlot !== null) nextSlot = actions.weaponSlot;
    else if (edges.nextWeapon) nextSlot = (weaponI.current + 1) % WEAPONS.length;
    else if (edges.prevWeapon) nextSlot = (weaponI.current + WEAPONS.length - 1) % WEAPONS.length;
    if (nextSlot !== weaponI.current) {
      weaponI.current = nextSlot;
      const def = WEAPONS[weaponI.current];
      weapons.current?.setId(def.id);
      viewmodel.current?.setId(def.id);
      ammo.current = def.mag;
      reserve.current = def.reserve;
      reloadT.current = 0;
      gameState.weapon = def.name;
    }

    const lookDelta = consumeLook();
    const third = view.current === "third";
    const aiming = actions.aim;
    const mouseSens = SENS * settings.mouseSens * (aiming ? 0.55 : 1);
    const stickRate = 2.35 * settings.stickSens;
    const stickHeld = Math.hypot(actions.lookStickX, actions.lookStickY) > 0.12;
    const inspecting = alignCam.current;

    if (inspecting) {
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

    if (stickHeld) stickLookLatch.current = true;
    if (third && !aiming && !inspecting && !stickHeld && stickLookLatch.current) {
      pitch.current = THREE.MathUtils.damp(pitch.current, 0, 8, dt);
      if (Math.abs(pitch.current) < 0.025) {
        pitch.current = 0;
        stickLookLatch.current = false;
      }
    }
    if (aiming) stickLookLatch.current = false;

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

    const wantCrouch = actions.crouch && grounded.current;
    const maxSpeed = wantCrouch
      ? CROUCH_SPEED
      : actions.sprint && actions.moveY > 0
        ? SPRINT_SPEED
        : WALK_SPEED;

    wish.current.copy(fwd.current).multiplyScalar(actions.moveY).addScaledVector(right.current, actions.moveX);
    if (inspecting) wish.current.set(0, 0, 0);
    if (wish.current.lengthSq() > 1) wish.current.normalize();

    if (inspecting) {
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

    if (edges.jump && !inspecting) jumpBuf.current = 0.12;
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
    const def = WEAPONS[weaponI.current];
    fireCd.current = Math.max(0, fireCd.current - dt);
    if (reloadT.current > 0) {
      reloadT.current -= dt;
      if (reloadT.current <= 0) {
        const need = def.mag - ammo.current;
        const take = Math.min(need, reserve.current);
        ammo.current += take;
        reserve.current -= take;
      }
    }
    if (edges.reload && reloadT.current <= 0 && ammo.current < def.mag && reserve.current > 0) {
      reloadT.current = def.reload;
      controller.upper.play(CLIP.reload, 0.08);
    }
    if (edges.fire && reloadT.current <= 0) {
      if (ammo.current <= 0) playEmpty();
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

    let loco = CLIP.idle;
    if (!grounded.current) {
      controller.lower.setBackpedal(false);
      if (vy.current > 0.2) controller.lower.play(CLIP.jumpStart, 0.06);
      else controller.lower.play(CLIP.jumpLoop, 0.1);
    } else if (landHold.current > 0 && !moving) {
      landHold.current = Math.max(0, landHold.current - dt);
      controller.lower.play(CLIP.jumpLand, 0.05);
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
    const nck = neckBone.current ?? headBone.current;
    if (nck) {
      nck.getWorldPosition(_neckPos);
      setHeadCutY(baseMeshes.current, _neckPos.y - 0.05);
    }

    const head = headBone.current;
    const neck = neckBone.current;
    const hideSkull = !inMenu && fps;
    if (head) head.scale.setScalar(hideSkull ? 0.01 : 1);
    if (neck) neck.scale.setScalar(hideSkull ? 0.01 : 1);
    body.visible = true;
    if (weapons.current) weapons.current.root.visible = !inMenu;
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
      adsBlend.current = THREE.MathUtils.damp(adsBlend.current, aiming ? 1 : 0, 14, dt);
      const t = adsBlend.current;
      persp.rotation.order = "YXZ";
      persp.rotation.y = yaw.current;
      persp.rotation.x = pitch.current + recoil.current;
      persp.rotation.z = 0;

      const lookDir = wish.current;
      lookDir.set(0, 0, -1).applyEuler(persp.rotation);

      const down = Math.max(0, -pitch.current);
      persp.position.set(pos.current.x, pos.current.y + eye.current + bobY, pos.current.z);
      persp.position.addScaledVector(camFwd.current, 0.14 + down * 0.7 + t * 0.16);
      persp.position.y -= t * 0.04;
      nextFov = 75 - t * 30;
      nextNear = 0.1;
      lookTarget.current.copy(persp.position).addScaledVector(lookDir, 8);
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
    if (!alignCam.current && aiming && !fps) weapons.current?.aimAt(lookTarget.current);
    else weapons.current?.aimAt(null);
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
    gameState.magSize = def.mag;
    gameState.pad = actions.padActive;
    if (edges.menu) gameState.menuPulse = true;
  });

  return (
    <group>
      <primitive object={body} />
      <pointLight ref={muzzle} color="#ffd9a0" distance={4} intensity={0} />
    </group>
  );
}
