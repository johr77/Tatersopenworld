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
import { attachWeapons, makeViewmodel, WEAPONS, type WeaponHandle } from "./weapon";
import { lookFile, type LookId } from "./profiles";

useGLTF.preload("/models/character.glb");

const WALK_SPEED = 3.2;
const SPRINT_SPEED = 7.4;
const CROUCH_SPEED = 1.7;
const ACCEL = 22;
const AIR_ACCEL = 6;
const FRICTION = 12;
const GRAVITY = 24;
const JUMP_V = 7.2;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.05;
const SENS = 0.00205;
const PITCH_LIM = Math.PI / 2 - 0.04;
const PLAYER_R = 0.32;

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
  aimDown: "Pistol_Aim_Down",
  pistolIdle: "Pistol_Idle_Loop",
};

type MixerAction = THREE.AnimationAction;

function makeController(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, MixerAction>();
  for (const clip of clips) {
    const a = mixer.clipAction(clip);
    const loop = /Loop$/.test(clip.name);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.enabled = true;
    actions.set(clip.name, a);
  }
  let current = "";
  let backpedal = false;
  const locomo = new Set([CLIP.walk, CLIP.jog, CLIP.sprint, CLIP.crouchWalk]);
  const applyScale = () => {
    const a = current ? actions.get(current) : undefined;
    if (!a) return;
    a.setEffectiveTimeScale(backpedal && locomo.has(current) ? -1 : 1);
  };
  const label = () => {
    const base = current.replaceAll("_", " ").replace(/ Loop$/, "");
    gameState.clip = backpedal && locomo.has(current) ? `${base} Back` : base;
  };
  const play = (name: string, fade = 0.18) => {
    if (name === current) return;
    const next = actions.get(name);
    if (!next) return;
    const prev = current ? actions.get(current) : undefined;
    next.reset().fadeIn(fade).play();
    prev?.fadeOut(fade);
    current = name;
    applyScale();
    label();
  };
  const setBackpedal = (back: boolean) => {
    if (back === backpedal) return;
    backpedal = back;
    applyScale();
    label();
  };
  return { mixer, play, setBackpedal, get current() { return current; }, actions };
}

function collectBones(root: THREE.Object3D) {
  const map = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o.name) map.set(o.name, o);
  });
  return map;
}

function pairBones(srcRoot: THREE.Object3D, dstRoot: THREE.Object3D) {
  const src = collectBones(srcRoot);
  const dst = collectBones(dstRoot);
  const pairs: {
    src: THREE.Object3D;
    dst: THREE.Object3D;
    srcRest: THREE.Quaternion;
    dstRest: THREE.Quaternion;
    srcRestPos: THREE.Vector3;
    dstRestPos: THREE.Vector3;
  }[] = [];
  for (const [name, a] of src) {
    const b = dst.get(name);
    if (b && b !== a) {
      pairs.push({
        src: a,
        dst: b,
        srcRest: a.quaternion.clone(),
        dstRest: b.quaternion.clone(),
        srcRestPos: a.position.clone(),
        dstRestPos: b.position.clone(),
      });
    }
  }
  return pairs;
}

export function Player() {
  const { camera, gl, scene } = useThree();
  const [look, setLook] = useState<LookId>(gameState.look);
  const isMannequin = look === "mannequin";
  const ualGltf = useGLTF("/models/character.glb");
  const skinGltf = useGLTF(lookFile(look));
  const ual = useMemo(() => cloneSkinned(ualGltf.scene), [ualGltf.scene]);
  const skin = useMemo(
    () => (look === "mannequin" ? ual : cloneSkinned(skinGltf.scene)),
    [look, ual, skinGltf.scene],
  );
  const controller = useMemo(
    () => makeController(ual, ualGltf.animations),
    [ual, ualGltf.animations],
  );
  const pairs = useRef<
    {
      src: THREE.Object3D;
      dst: THREE.Object3D;
      srcRest: THREE.Quaternion;
      dstRest: THREE.Quaternion;
      srcRestPos: THREE.Vector3;
      dstRestPos: THREE.Vector3;
    }[]
  >([]);
  const qInv = useRef(new THREE.Quaternion());
  const qDelta = useRef(new THREE.Quaternion());
  const posDelta = useRef(new THREE.Vector3());
  const plantBox = useRef(new THREE.Box3());

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
  const pos = useRef(new THREE.Vector3(0, 0, 10));
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

  useEffect(() => {
    initInput();
    const mannequin = look === "mannequin";
    ual.visible = mannequin;
    ual.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.visible = mannequin;
      m.castShadow = true;
      m.receiveShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const raw of mats) {
        const mat = raw as THREE.MeshStandardMaterial;
        if (mat.name === "M_Main") mat.color.set("#c9b89a");
        if (mat.name === "M_Joints") mat.color.set("#2f3b34");
      }
    });
    if (!mannequin) {
      skin.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      });
      pairs.current = pairBones(ual, skin);
    } else {
      pairs.current = [];
    }
    controller.play(CLIP.idle, 0);

    weapons.current?.dispose();
    const hand = (mannequin ? ual : skin).getObjectByName("hand_r") || ual.getObjectByName("hand_r");
    weapons.current = hand ? attachWeapons(hand) : null;
    weapons.current?.setLowered(true);
    weapons.current?.setId(WEAPONS[weaponI.current].id);

    if (!viewmodel.current) {
      const vm = makeViewmodel();
      viewmodel.current = vm;
      camera.add(vm.root);
      if (!camera.parent) scene.add(camera);
    }

    window.__controlsTest = {
      getYaw: () => yaw.current,
      getBodyYaw: () => yaw.current,
      getSpeed: () => gameState.speed,
      getPosition: () => ({ x: pos.current.x, y: pos.current.y, z: pos.current.z }),
      getAnimScale: () => {
        const a = controller.actions.get(controller.current);
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
        pairs: pairs.current.length,
        ualBones: collectBones(ual).size,
        skinBones: collectBones(skin).size,
        hand: Boolean(skin.getObjectByName("hand_r")),
        gunKids: weapons.current?.children() ?? 0,
        vmKids: viewmodel.current?.children() ?? 0,
      }),
    };

    gameState.ready = true;
    gameState.weapon = WEAPONS[weaponI.current].name;
    return () => {
      weapons.current?.dispose();
      weapons.current = null;
    };
  }, [camera, controller, scene, skin, ual]);

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

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const actions = sampleActions();
    if (edges.toggleView) view.current = view.current === "fps" ? "third" : "fps";
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

    if (third && actions.freeLook) {
      orbitYaw.current -= lookDelta.dx * mouseSens;
      orbitPitch.current -= lookDelta.dy * mouseSens;
    } else {
      yaw.current -= lookDelta.dx * mouseSens;
      pitch.current -= lookDelta.dy * mouseSens;
      yaw.current -= actions.lookStickX * stickRate * dt;
      pitch.current -= actions.lookStickY * 1.9 * settings.stickSens * dt;
      orbitYaw.current = THREE.MathUtils.damp(orbitYaw.current, 0, 12, dt);
      orbitPitch.current = THREE.MathUtils.damp(orbitPitch.current, 0, 12, dt);
    }

    pitch.current = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, pitch.current));
    orbitPitch.current = Math.max(-0.9, Math.min(0.7, orbitPitch.current));

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
    if (wish.current.lengthSq() > 1) wish.current.normalize();

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

    if (edges.jump) jumpBuf.current = 0.12;
    else jumpBuf.current = Math.max(0, jumpBuf.current - dt);
    if (grounded.current) coyote.current = 0.12;
    else coyote.current = Math.max(0, coyote.current - dt);

    if (jumpBuf.current > 0 && coyote.current > 0) {
      vy.current = JUMP_V;
      grounded.current = false;
      coyote.current = 0;
      jumpBuf.current = 0;
      controller.play(CLIP.jumpStart, 0.05);
    }

    vy.current -= GRAVITY * dt;
    pos.current.y += vy.current * dt;
    if (pos.current.y <= 0) {
      pos.current.y = 0;
      if (!grounded.current) controller.play(CLIP.jumpLand, 0.05);
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
      controller.play(CLIP.reload, 0.08);
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
        controller.play(CLIP.shoot, 0.04);
        ray.current.setFromCamera(ndc.current, camera);
        const hits = ray.current.intersectObjects(scene.children, true);
        const hit = hits.find((h) => {
          let o: THREE.Object3D | null = h.object;
          while (o) {
            if (o === skin || o === ual || o === viewmodel.current?.root) return false;
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
    const busy = shootHold.current > 0 || reloadT.current > 0;
    weapons.current?.setLowered(!aiming && shootHold.current <= 0);
    viewmodel.current?.setLowered(!aiming && shootHold.current <= 0);

    if (!busy && grounded.current) {
      if (wantCrouch && moving) controller.play(CLIP.crouchWalk);
      else if (wantCrouch) controller.play(CLIP.crouchIdle);
      else if (actions.sprint && moving && actions.moveY > 0.2) controller.play(CLIP.sprint);
      else if (moving && xz > 4.2) controller.play(CLIP.jog);
      else if (moving) controller.play(CLIP.walk);
      else if (aiming) controller.play(CLIP.aim);
      else controller.play(CLIP.idle);
      controller.setBackpedal(moving && actions.moveY < -0.12);
    } else if (!grounded.current) {
      controller.setBackpedal(false);
      if (controller.current === CLIP.jumpStart) {
        const start = controller.actions.get(CLIP.jumpStart);
        if (start && start.time > 0.22) controller.play(CLIP.jumpLoop, 0.1);
      } else if (controller.current !== CLIP.jumpLoop && controller.current !== CLIP.jumpStart) {
        controller.play(CLIP.jumpLoop, 0.1);
      }
    }

    controller.mixer.update(dt);
    for (const p of pairs.current) {
      qInv.current.copy(p.srcRest).invert();
      qDelta.current.copy(qInv.current).multiply(p.src.quaternion);
      p.dst.quaternion.copy(p.dstRest).multiply(qDelta.current);
      posDelta.current.copy(p.src.position).sub(p.srcRestPos);
      p.dst.position.copy(p.dstRestPos).add(posDelta.current);
    }

    const targetEye = wantCrouch ? EYE_CROUCH : EYE_STAND;
    eye.current = THREE.MathUtils.damp(eye.current, targetEye, 10, dt);
    if (moving) bob.current += dt * xz * 1.6;
    const bobY = moving ? Math.sin(bob.current) * 0.035 : 0;

    const bodyYaw = yaw.current + Math.PI;
    ual.position.copy(pos.current);
    ual.rotation.order = "YXZ";
    ual.rotation.y = bodyYaw;
    skin.position.copy(pos.current);
    skin.rotation.order = "YXZ";
    skin.rotation.y = bodyYaw;
    if (!isMannequin) {
      skin.updateMatrixWorld(true);
      plantBox.current.setFromObject(skin);
      if (Number.isFinite(plantBox.current.min.y)) {
        const lift = pos.current.y - plantBox.current.min.y;
        if (Math.abs(lift) > 0.001) skin.position.y += lift;
      }
    }
    const showBody = view.current === "third";
    if (isMannequin) {
      ual.visible = showBody;
      ual.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.visible = showBody;
      });
    } else {
      ual.visible = false;
      skin.visible = showBody;
    }
    if (viewmodel.current) viewmodel.current.root.visible = view.current === "fps";
    if (muzzle.current) muzzle.current.intensity = flash.current > 0 ? 18 : 0;

    const persp = camera as THREE.PerspectiveCamera;
    if (view.current === "fps") {
      persp.position.set(pos.current.x, pos.current.y + eye.current + bobY, pos.current.z);
      persp.rotation.order = "YXZ";
      persp.rotation.y = yaw.current;
      persp.rotation.x = pitch.current + recoil.current;
      persp.rotation.z = 0;
      persp.fov = aiming ? 62 : 78;
      persp.updateProjectionMatrix();
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
      persp.fov = 70;
      persp.updateProjectionMatrix();
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
    gameState.ammo = ammo.current;
    gameState.reserve = reserve.current;
    gameState.reloading = reloadT.current > 0;
    gameState.magSize = def.mag;
    gameState.pad = actions.padActive;
    if (edges.menu) gameState.menuPulse = true;
  });

  return (
    <group>
      <primitive object={ual} />
      {look !== "mannequin" && skin !== ual ? <primitive object={skin} /> : null}
      <pointLight ref={muzzle} color="#ffd9a0" distance={4} intensity={0} />
    </group>
  );
}
