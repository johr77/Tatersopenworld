"use client";

import { useMemo, useRef } from "react";
import { Environment, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BUSHES, GRASS, TARGETS, TREES, type Prop } from "./world-data";

useGLTF.preload("/models/nature/CommonTree_1.gltf");
useGLTF.preload("/models/nature/CommonTree_3.gltf");
useGLTF.preload("/models/nature/CommonTree_5.gltf");
useGLTF.preload("/models/nature/Pine_1.gltf");
useGLTF.preload("/models/nature/Bush_Common.gltf");
useGLTF.preload("/models/nature/Grass_Common_Tall.gltf");
useGLTF.preload("/models/nature/Grass_Common_Short.gltf");

const KIND_URL: Record<Prop["kind"], string> = {
  CommonTree_1: "/models/nature/CommonTree_1.gltf",
  CommonTree_3: "/models/nature/CommonTree_3.gltf",
  CommonTree_5: "/models/nature/CommonTree_5.gltf",
  Pine_1: "/models/nature/Pine_1.gltf",
  Bush_Common: "/models/nature/Bush_Common.gltf",
  Grass_Common_Tall: "/models/nature/Grass_Common_Tall.gltf",
  Grass_Common_Short: "/models/nature/Grass_Common_Short.gltf",
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
  const tex = useMemo(() => {
    const t = new THREE.TextureLoader().load("/textures/grass.jpg");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(36, 36);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[90, 90]} />
      <meshStandardMaterial map={tex} roughness={0.95} metalness={0} color="#6e7f58" />
    </mesh>
  );
}

function KnockPlate({ x, z, h, id }: { x: number; z: number; h: number; id: number }) {
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
    if (pivot.current) pivot.current.rotation.x = ang.current;
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.12, 0.9, 0.12]} />
        <meshStandardMaterial color="#5c4634" roughness={0.9} />
      </mesh>
      <group ref={pivot} position={[0, 0.9, 0]} userData={data}>
        <mesh position={[0, h / 2, 0]} castShadow userData={data}>
          <boxGeometry args={[0.72, h, 0.06]} />
          <meshStandardMaterial color="#c4a574" roughness={0.72} />
        </mesh>
        <mesh position={[0, h * 0.62, 0.035]} userData={data}>
          <circleGeometry args={[0.16, 20]} />
          <meshStandardMaterial color="#7a2e28" roughness={0.45} />
        </mesh>
        <mesh position={[0, h * 0.62, 0.038]} userData={data}>
          <circleGeometry args={[0.07, 16]} />
          <meshStandardMaterial color="#d8c7a2" roughness={0.4} />
        </mesh>
      </group>
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
        intensity={0.72}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={70}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        color="#e8ece8"
      />
      <fog attach="fog" args={["#8b97a0", 22, 68]} />
      <Ground />
      <Scattered kind="CommonTree_1" items={TREES} />
      <Scattered kind="CommonTree_3" items={TREES} />
      <Scattered kind="CommonTree_5" items={TREES} />
      <Scattered kind="Pine_1" items={TREES} />
      <Scattered kind="Bush_Common" items={BUSHES} />
      <Scattered kind="Grass_Common_Tall" items={GRASS} />
      <Scattered kind="Grass_Common_Short" items={GRASS} />
      {TARGETS.map((t, i) => (
        <KnockPlate key={i} id={i} x={t.x} z={t.z} h={Math.max(0.7, t.h * 0.55)} />
      ))}
    </>
  );
}
