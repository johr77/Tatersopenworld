import { useEffect, useRef } from "react";
import * as THREE from "three";
import { loadCharacter, type CharacterRig } from "@/game/load-character";

export function CharacterPreview({ charId }: { charId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.setClearColor(0x2a2620, 1);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.className = "h-full w-full";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf3ece3, 0x4a4338, 1.55));
    const key = new THREE.DirectionalLight(0xfff4e4, 1.85);
    key.position.set(2.1, 4.4, 3.1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9d4e6, 0.7);
    fill.position.set(-2.4, 1.8, 2.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe7c8, 0.45);
    rim.position.set(-0.4, 2.2, -2.6);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.08, 40);
    camera.position.set(0.2, 1.42, 2.55);
    camera.lookAt(0, 1.02, 0);

    let wrap: THREE.Object3D | null = null;
    let rig: CharacterRig | null = null;
    let raf = 0;
    const clock = new THREE.Clock();

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();

    const tick = () => {
      if (dead) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      rig?.setMoving(false);
      rig?.update(dt);
      if (wrap) wrap.rotation.y += dt * 0.45;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    loadCharacter(charId, 1.7)
      .then((loaded) => {
        if (dead) {
          loaded.dispose();
          return;
        }
        rig = loaded;
        wrap = loaded.wrap;
        wrap.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.frustumCulled = false;
        });
        scene.add(wrap);
      })
      .catch((err) => console.error("character preview", err));

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [charId]);

  return <div ref={hostRef} className="h-full w-full" />;
}
