"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Environment, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  BUSHES,
  BUILDINGS,
  GRASS,
  PATH_STONES,
  ROCKS,
  TARGETS,
  TREES,
  type BuildKind,
  type Prop,
} from "./world-data";
import { cloneBuild, loadBuild } from "./props";

useGLTF.preload("/models/nature/CommonTree_1.gltf");
useGLTF.preload("/models/nature/CommonTree_3.gltf");
useGLTF.preload("/models/nature/CommonTree_5.gltf");
useGLTF.preload("/models/nature/Pine_1.gltf");
useGLTF.preload("/models/nature/Bush_Common.gltf");
useGLTF.preload("/models/nature/Grass_Common_Tall.gltf");
useGLTF.preload("/models/nature/Grass_Common_Short.gltf");
useGLTF.preload("/models/nature/Rock_Medium_1.gltf");
useGLTF.preload("/models/nature/Rock_Medium_2.gltf");
useGLTF.preload("/models/nature/Rock_Medium_3.gltf");
useGLTF.preload("/models/nature/RockPath_Round_Wide.gltf");
useGLTF.preload("/models/nature/RockPath_Round_Small_1.gltf");
useGLTF.preload("/models/nature/RockPath_Round_Small_2.gltf");
useGLTF.preload("/models/nature/RockPath_Round_Small_3.gltf");

const KIND_URL: Record<Prop["kind"], string> = {
  CommonTree_1: "/models/nature/CommonTree_1.gltf",
  CommonTree_3: "/models/nature/CommonTree_3.gltf",
  CommonTree_5: "/models/nature/CommonTree_5.gltf",
  Pine_1: "/models/nature/Pine_1.gltf",
  Bush_Common: "/models/nature/Bush_Common.gltf",
  Grass_Common_Tall: "/models/nature/Grass_Common_Tall.gltf",
  Grass_Common_Short: "/models/nature/Grass_Common_Short.gltf",
  Rock_Medium_1: "/models/nature/Rock_Medium_1.gltf",
  Rock_Medium_2: "/models/nature/Rock_Medium_2.gltf",
  Rock_Medium_3: "/models/nature/Rock_Medium_3.gltf",
  RockPath_Round_Wide: "/models/nature/RockPath_Round_Wide.gltf",
  RockPath_Round_Small_1: "/models/nature/RockPath_Round_Small_1.gltf",
  RockPath_Round_Small_2: "/models/nature/RockPath_Round_Small_2.gltf",
  RockPath_Round_Small_3: "/models/nature/RockPath_Round_Small_3.gltf",
};

function prepareScene(src: THREE.Object3D) {
  const root = src.clone(true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = mats.map((m) => {
      const mat = (m as THREE.MeshStandardMaterial).clone();
      mat.metalness = 0;
      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.anisotropy = 4;
      }
      if (mat.alphaTest > 0 || /leaf|grass|bush|leaves/i.test(mat.name)) {
        mat.alphaTest = 0.35;
        mat.transparent = false;
        mat.side = THREE.DoubleSide;
      }
      return mat;
    });
  });
  return root;
}

function Scattered({ kind, items }: { kind: Prop["kind"]; items: Prop[] }) {
  const { scene } = useGLTF(KIND_URL[kind]);
  const template = useMemo(() => prepareScene(scene), [scene]);
  const placed = items.filter((p) => p.kind === kind);
  return (
    <group>
      {placed.map((p, i) => (
        <primitive
          key={`${kind}-${i}`}
          object={template.clone(true)}
          position={[p.x, 0, p.z]}
          rotation={[0, p.rot, 0]}
          scale={p.scale}
        />
      ))}
    </group>
  );
}

function Ground() {
  const grass = useMemo(() => {
    const t = new THREE.TextureLoader().load("/textures/grass.jpg");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(42, 42);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  const dirt = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#6a5438";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${90 + (i % 40)},${70 + ((i * 3) % 28)},${40 + (i % 18)},0.35)`;
      g.fillRect((i * 17) % 256, (i * 29) % 256, 3 + (i % 5), 2 + (i % 4));
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 18);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[110, 110]} />
        <meshStandardMaterial map={grass} roughness={0.95} metalness={0} color="#6e7f58" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -4]} receiveShadow>
        <planeGeometry args={[4.6, 42]} />
        <meshStandardMaterial map={dirt} roughness={1} metalness={0} color="#7a6244" />
      </mesh>
    </group>
  );
}

function useBuildTemplate(kind: BuildKind) {
  const [tpl, setTpl] = useState<THREE.Group | null>(null);
  useEffect(() => {
    let live = true;
    loadBuild(kind).then((g) => {
      if (live) setTpl(g);
    });
    return () => {
      live = false;
    };
  }, [kind]);
  return tpl;
}

function Buildings() {
  const kinds = useMemo(() => Array.from(new Set(BUILDINGS.map((b) => b.kind))), []);
  return (
    <group>
      {kinds.map((kind) => (
        <BuildingKind key={kind} kind={kind} />
      ))}
    </group>
  );
}

function BuildingKind({ kind }: { kind: BuildKind }) {
  const tpl = useBuildTemplate(kind);
  const items = BUILDINGS.filter((b) => b.kind === kind);
  const clones = useMemo(() => {
    if (!tpl) return [];
    return items.map(() => cloneBuild(kind) ?? tpl.clone(true));
  }, [tpl, kind, items.length]);
  if (!tpl) return null;
  return (
    <group>
      {items.map((p, i) => (
        <primitive
          key={`${kind}-${i}`}
          object={clones[i]}
          position={[p.x, 0, p.z]}
          rotation={[0, p.rot, 0]}
          scale={p.scale}
        />
      ))}
    </group>
  );
}

function KnockGroup({
  id,
  position,
  children,
  axis = "x",
}: {
  id: number;
  position: [number, number, number];
  children: ReactNode;
  axis?: "x" | "z";
}) {
  const pivot = useRef<THREE.Group>(null);
  const ang = useRef(0);
  const spin = useRef(0);
  const down = useRef(false);
  const data = useMemo(
    () => ({
      target: true,
      id,
      down: false,
      knock: () => {
        if (down.current) return;
        down.current = true;
        data.down = true;
        spin.current = 9;
      },
    }),
    [id],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    if (!down.current) return;
    spin.current += 22 * dt;
    ang.current = Math.min(Math.PI / 2, ang.current + spin.current * dt);
    if (pivot.current) {
      if (axis === "z") pivot.current.rotation.z = ang.current;
      else pivot.current.rotation.x = ang.current;
    }
  });

  return (
    <group position={position}>
      <group ref={pivot} userData={data}>
        <group userData={data}>{children}</group>
      </group>
    </group>
  );
}

function KnockPlate({ x, z, h, id }: { x: number; z: number; h: number; id: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.12, 0.9, 0.12]} />
        <meshStandardMaterial color="#5c4634" roughness={0.9} />
      </mesh>
      <KnockGroup id={id} position={[0, 0.9, 0]}>
        <mesh position={[0, h / 2, 0]} castShadow>
          <boxGeometry args={[0.72, h, 0.06]} />
          <meshStandardMaterial color="#c4a574" roughness={0.72} />
        </mesh>
        <mesh position={[0, h * 0.62, 0.035]}>
          <circleGeometry args={[0.16, 20]} />
          <meshStandardMaterial color="#7a2e28" roughness={0.45} />
        </mesh>
        <mesh position={[0, h * 0.62, 0.038]}>
          <circleGeometry args={[0.07, 16]} />
          <meshStandardMaterial color="#d8c7a2" roughness={0.4} />
        </mesh>
      </KnockGroup>
    </group>
  );
}

function KnockBuild({
  kind,
  x,
  z,
  rot,
  scale,
  id,
}: {
  kind: BuildKind;
  x: number;
  z: number;
  rot: number;
  scale: number;
  id: number;
}) {
  const tpl = useBuildTemplate(kind);
  const obj = useMemo(() => (tpl ? tpl.clone(true) : null), [tpl]);
  if (!obj) return null;
  return (
    <KnockGroup id={id} position={[x, 0, z]} axis="z">
      <primitive object={obj} rotation={[0, rot, 0]} scale={scale} />
    </KnockGroup>
  );
}

function KnockCan({ x, z, id }: { x: number; z: number; id: number }) {
  return (
    <KnockGroup id={id} position={[x, 0, z]} axis="z">
      <mesh position={[0, 0.16, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.32, 14]} />
        <meshStandardMaterial color="#c4c8cc" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.33, 0]} castShadow>
        <cylinderGeometry args={[0.072, 0.072, 0.02, 14]} />
        <meshStandardMaterial color="#8aa05a" metalness={0.2} roughness={0.5} />
      </mesh>
    </KnockGroup>
  );
}

function RangeTargets() {
  return (
    <group>
      {TARGETS.map((t, i) => {
        if (t.type === "plate") return <KnockPlate key={i} id={i} x={t.x} z={t.z} h={t.h ?? 1.2} />;
        if (t.type === "barrel")
          return <KnockBuild key={i} id={i} kind="Barrel" x={t.x} z={t.z} rot={t.rot ?? 0} scale={t.scale ?? 0.85} />;
        if (t.type === "crate")
          return <KnockBuild key={i} id={i} kind="Crate" x={t.x} z={t.z} rot={t.rot ?? 0} scale={t.scale ?? 0.7} />;
        if (t.type === "vase")
          return <KnockBuild key={i} id={i} kind="Vase" x={t.x} z={t.z} rot={0} scale={t.scale ?? 1.8} />;
        return <KnockCan key={i} id={i} x={t.x} z={t.z} />;
      })}
    </group>
  );
}

export function World() {
  return (
    <>
      <Environment
        files="/textures/sky/kloofendal_overcast_1k.hdr"
        background
        backgroundIntensity={1.12}
        environmentIntensity={0.48}
      />
      <hemisphereLight args={["#c9d3dc", "#3a4334", 0.55]} />
      <directionalLight
        position={[16, 28, 10]}
        intensity={0.78}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={80}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
        color="#e8ece8"
      />
      <fog attach="fog" args={["#8b97a0", 42, 95]} />
      <Ground />
      <Scattered kind="CommonTree_1" items={TREES} />
      <Scattered kind="CommonTree_3" items={TREES} />
      <Scattered kind="CommonTree_5" items={TREES} />
      <Scattered kind="Pine_1" items={TREES} />
      <Scattered kind="Bush_Common" items={BUSHES} />
      <Scattered kind="Grass_Common_Tall" items={GRASS} />
      <Scattered kind="Grass_Common_Short" items={GRASS} />
      <Scattered kind="Rock_Medium_1" items={ROCKS} />
      <Scattered kind="Rock_Medium_2" items={ROCKS} />
      <Scattered kind="Rock_Medium_3" items={ROCKS} />
      <Scattered kind="RockPath_Round_Wide" items={PATH_STONES} />
      <Scattered kind="RockPath_Round_Small_1" items={PATH_STONES} />
      <Scattered kind="RockPath_Round_Small_2" items={PATH_STONES} />
      <Scattered kind="RockPath_Round_Small_3" items={PATH_STONES} />
      <Buildings />
      <RangeTargets />
    </>
  );
}
