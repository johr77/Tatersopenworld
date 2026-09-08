"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { World } from "./world";
import { Player } from "./player";
import { Hud } from "./hud";
import { gameState } from "./state";
import { loadPct, loadProgress } from "./loader";

function LoadGate() {
  const [pct, setPct] = useState(0);
  const [ready, setReady] = useState(gameState.ready);
  useEffect(() => {
    const id = setInterval(() => {
      setPct(loadPct());
      setReady(gameState.ready && !loadProgress.active);
    }, 80);
    return () => clearInterval(id);
  }, []);
  if (ready && pct >= 100) return null;
  return (
    <div className="load-float">
      <p className="load-label">Loading range {Math.max(pct, ready ? 90 : pct)}%</p>
      <div className="load-bar">
        <span style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  );
}

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={hostRef} className="game-host">
      <Suspense fallback={null}>
        <Canvas
          camera={{ fov: 70, position: [0, 1.6, 14], near: 0.08, far: 140 }}
          shadows
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.setClearColor("#8b97a0");
            gl.domElement.style.touchAction = "none";
          }}
        >
          <World />
          <Player />
        </Canvas>
      </Suspense>
      <LoadGate />
      <Hud hostRef={hostRef} />
    </div>
  );
}
