"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Clone, Environment, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  MEGA_TREE_FILES,
  TARGETS,
  STASH,
  STONES,
  TREES,
  WEEDS,
  markFallen,
  type BuildKind,
  type BuildPlace,
  type TreePlace,
} from "./world-data";
import { loadBuild } from "./props";
import { gameState } from "./state";
import { ghostPose, PIECES, subscribeBuild } from "./build";

for (const file of MEGA_TREE_FILES) useGLTF.preload(`/models/nature/${file}.gltf`);
useGLTF.preload("/models/nature/Grass_Wispy_Short.gltf");
useGLTF.preload("/models/nature/Grass_Wispy_Tall.gltf");
useGLTF.preload("/models/nature/Pebble_Round_1.gltf");
useGLTF.preload("/models/nature/Pebble_Round_2.gltf");
useGLTF.preload("/models/nature/Pebble_Round_3.gltf");

function ChopPine({ tree }: { tree: TreePlace }) {
  const { scene } = useGLTF(`/models/nature/${tree.file}.gltf`);
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
      ref.current.traverse((o) => {
        o.raycast = () => {};
      });
    }
  });

  return (
    <group ref={ref} position={[tree.x, 0, tree.z]} rotation={[0, tree.rot, 0]} scale={tree.scale} userData={data}>
      <Clone object={scene} castShadow receiveShadow />
    </group>
  );
}

function PickWeed({ weed }: { weed: (typeof WEEDS)[number] }) {
  const file = weed.kind === "tall" ? "Grass_Wispy_Tall" : "Grass_Wispy_Short";
  const { scene } = useGLTF(`/models/nature/${file}.gltf`);
  const ref = useRef<THREE.Group>(null);
  const gone = useRef(false);
  const hideIn = useRef(-1);
  const data = useMemo(
    () => ({
      kind: "weed",
      use: () => {
        if (gone.current || !ref.current) return false;
        gone.current = true;
        ref.current.userData.picked = true;
        hideIn.current = 0.55;
        return true;
      },
      pull: (delay: number) => {
        hideIn.current = delay;
      },
    }),
    [],
  );
  useFrame((_, dt) => {
    if (hideIn.current < 0 || !ref.current) return;
    hideIn.current -= dt;
    if (hideIn.current > 0) return;
    hideIn.current = -1;
    ref.current.visible = false;
    ref.current.traverse((o) => {
      o.raycast = () => {};
    });
  });
  return (
    <group ref={ref} position={[weed.x, 0, weed.z]} rotation={[0, weed.rot, 0]} scale={weed.scale} userData={data}>
      <Clone object={scene} />
    </group>
  );
}

function PickStone({ stone }: { stone: (typeof STONES)[number] }) {
  const { scene } = useGLTF(`/models/nature/${stone.file}.gltf`);
  const ref = useRef<THREE.Group>(null);
  const gone = useRef(false);
  const hideIn = useRef(-1);
  const data = useMemo(
    () => ({
      kind: "stone",
      use: () => {
        if (gone.current || !ref.current) return false;
        gone.current = true;
        ref.current.userData.picked = true;
        hideIn.current = 0.4;
        return true;
      },
      pull: (delay: number) => {
        hideIn.current = delay;
      },
    }),
    [],
  );
  useFrame((_, dt) => {
    if (hideIn.current < 0 || !ref.current) return;
    hideIn.current -= dt;
    if (hideIn.current > 0) return;
    hideIn.current = -1;
    ref.current.visible = false;
    ref.current.traverse((o) => {
      o.raycast = () => {};
    });
  });
  return (
    <group ref={ref} position={[stone.x, 0, stone.z]} rotation={[0, stone.rot, 0]} scale={stone.scale} userData={data}>
      <Clone object={scene} />
    </group>
  );
}

function StorageCrate() {
  const tpl = useBuildTemplate("Crate");
  const obj = useMemo(() => (tpl ? tpl.clone(true) : null), [tpl]);
  const data = useMemo(
    () => ({
      kind: "stash",
      use: () => {
        gameState.crateOpen = true;
        return true;
      },
    }),
    [],
  );
  if (!obj) return null;
  return (
    <group position={[STASH.x, 0, STASH.z]} rotation={[0, STASH.rot, 0]} scale={STASH.scale} userData={data}>
      <primitive object={obj} />
    </group>
  );
}

function MegaKind({ file, items }: { file: string; items: TreePlace[] }) {
  const placed = items.filter((p) => p.file === file);
  return (
    <group>
      {placed.map((p) => (
        <ChopPine key={`pine-${file}-${p.id}`} tree={p} />
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
      <mesh name="Ground" userData={{ ground: true }} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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

function GhostBuild() {
  const camera = useThree((s) => s.camera);
  const def = PIECES.find((p) => p.id === gameState.buildPiece) ?? PIECES[0]!;
  const tpl = useBuildTemplate(def.kind);
  const obj = useMemo(() => {
    if (!tpl) return null;
    const c = tpl.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};
      mesh.castShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((raw) => {
        const src = raw as THREE.MeshStandardMaterial;
        const mat = src.clone();
        mat.transparent = true;
        mat.opacity = 0.4;
        mat.depthWrite = false;
        mat.emissive = new THREE.Color("#c8c4b8");
        mat.emissiveIntensity = 0.22;
        return mat;
      });
      mesh.material = next.length === 1 ? next[0]! : next;
    });
    return c;
  }, [tpl]);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    if (!gameState.buildMode) {
      g.visible = false;
      return;
    }
    const pose = ghostPose(camera);
    if (!pose) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(pose.x, 0, pose.z);
    g.rotation.y = pose.rot;
    g.scale.setScalar(pose.scale);
  });
  if (!obj) return null;
  return (
    <group ref={ref} visible={false}>
      <primitive object={obj} />
    </group>
  );
}

function PlacedBuild({ place }: { place: BuildPlace }) {
  const tpl = useBuildTemplate(place.kind);
  const obj = useMemo(() => (tpl ? tpl.clone(true) : null), [tpl]);
  if (!obj) return null;
  return <primitive object={obj} position={[place.x, 0, place.z]} rotation={[0, place.rot, 0]} scale={place.scale} />;
}

function PlayerBuilds() {
  const [rev, setRev] = useState(0);
  useEffect(() => subscribeBuild(() => setRev((n) => n + 1)), []);
  useEffect(() => {
    for (const p of PIECES) loadBuild(p.kind);
  }, []);
  void rev;
  return (
    <group>
      {gameState.buildings.map((b, i) => (
        <PlacedBuild key={`${b.kind}-${b.x}-${b.z}-${b.rot}-${i}`} place={b} />
      ))}
      {gameState.buildMode ? (
        <>
          <gridHelper args={[48, 48, "#8a9680", "#3d4a40"]} position={[0, 0.02, 0]} />
          <GhostBuild key={gameState.buildPiece} />
        </>
      ) : null}
    </group>
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
        files="/textures/sky/kloofendal_48d_partly_cloudy_puresky_1k.exr"
        background
        backgroundIntensity={1.05}
        environmentIntensity={0.52}
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
      <fog attach="fog" args={["#9aaec0", 80, 180]} />
      <Ground />
      {MEGA_TREE_FILES.map((file) => (
        <MegaKind key={`mega-${file}`} file={file} items={TREES} />
      ))}
      {WEEDS.map((w) => (
        <PickWeed key={`weed-${w.id}`} weed={w} />
      ))}
      {STONES.map((s) => (
        <PickStone key={`stone-${s.id}`} stone={s} />
      ))}
      <StorageCrate />
      <RangeTargets />
      <PlayerBuilds />
    </>
  );
}
