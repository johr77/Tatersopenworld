"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Environment, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  MEGA_TREE_FILES,
  TARGETS,
  TREES,
  markFallen,
  type BuildKind,
  type TreePlace,
} from "./world-data";
import { loadBuild } from "./props";

for (const file of MEGA_TREE_FILES) useGLTF.preload(`/models/nature/${file}.gltf`);

function prepareScene(src: THREE.Object3D, shadows = true) {
  const root = src.clone(true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.frustumCulled = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = mats.map((m) => {
      const mat = (m as THREE.MeshStandardMaterial).clone();
      mat.metalness = 0;
      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.anisotropy = 2;
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

function ChopPine({ tree, object }: { tree: TreePlace; object: THREE.Object3D }) {
  const ref = useRef<THREE.Group>(null);
  const hp = useRef(4);
  const fallT = useRef(0);
  const gone = useRef(false);
  const data = useMemo(
    () => ({
      tree: true,
      id: tree.id,
      chop: () => {
        if (gone.current || fallT.current > 0) return "gone" as const;
        hp.current -= 1;
        if (hp.current > 0) return "hit" as const;
        fallT.current = 0.001;
        markFallen(tree.id);
        return "fell" as const;
      },
    }),
    [tree.id],
  );

  useFrame((_, dtRaw) => {
    if (fallT.current <= 0 || !ref.current) return;
    fallT.current += Math.min(dtRaw, 0.05);
    const t = Math.min(1, fallT.current / 1.35);
    ref.current.rotation.z = t * t * (Math.PI / 2);
    if (t >= 1) {
      gone.current = true;
      ref.current.visible = false;
    }
  });

  return (
    <group ref={ref} position={[tree.x, 0, tree.z]} rotation={[0, tree.rot, 0]} scale={tree.scale} userData={data}>
      <primitive object={object} />
    </group>
  );
}

function MegaKind({ file, items }: { file: string; items: TreePlace[] }) {
  const { scene } = useGLTF(`/models/nature/${file}.gltf`);
  const template = useMemo(() => prepareScene(scene, true), [scene]);
  const placed = items.filter((p) => p.file === file);
  const clones = useMemo(
    () => placed.map(() => template.clone(true)),
    [template, placed.length],
  );
  return (
    <group>
      {placed.map((p, i) => (
        <ChopPine key={`pine-${file}-${p.id}`} tree={p} object={clones[i]!} />
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
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial map={grass} roughness={0.95} metalness={0} color="#6e7f58" />
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

  const tagged = useRef(false);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    if (!tagged.current && pivot.current) {
      pivot.current.traverse((o) => o.layers.enable(1));
      tagged.current = true;
    }
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
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={55}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        color="#e8ece8"
      />
      <fog attach="fog" args={["#8b97a0", 48, 110]} />
      <Ground />
      {MEGA_TREE_FILES.map((file) => (
        <MegaKind key={`mega-${file}`} file={file} items={TREES} />
      ))}
      <RangeTargets />
    </>
  );
}
