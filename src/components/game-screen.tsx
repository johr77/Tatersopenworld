import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Crosshair, Hammer, LogOut, Pause, Settings2, Swords, Trees } from "lucide-react";
import { loadBinds } from "@/game/bindings";
import { OptionsPanel } from "./options-panel";
import type { GameEngine } from "@/game/engine";
import type { HudSnap, PlayerRecord } from "@/game/types";

const EMPTY: HudSnap = {
  wood: 0,
  tool: "axe",
  part: "floor",
  buildMode: false,
  menuOpen: false,
  paused: false,
  locked: false,
  cam: "third",
  loading: "Loading camp…",
  hint: "",
  pad: false,
};

export function GameScreen({ player, onQuit }: { player: PlayerRecord; onQuit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudSnap>(EMPTY);
  const [opts, setOpts] = useState(false);
  const stick = useRef<{ id: number; x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let engine: GameEngine | null = null;
    void import("@/game/engine").then(({ GameEngine }) => {
      if (dead || !host) return;
      const canvas = document.createElement("canvas");
      canvas.className = "absolute inset-0 h-full w-full touch-none";
      host.appendChild(canvas);
      engine = new GameEngine({
        canvas,
        playerId: player.id,
        charId: player.charId,
        binds: loadBinds(),
        onHud: setHud,
      });
      engineRef.current = engine;
      void engine.start();
    });
    return () => {
      dead = true;
      engine?.dispose();
      engineRef.current = null;
      host.replaceChildren();
    };
  }, [player.id, player.charId]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) engineRef.current?.setPaused(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const e = engineRef.current;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      <div ref={hostRef} className="absolute inset-0 h-full w-full" />

      {hud.loading ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-bg">
          <div className="text-center">
            <Trees className="mx-auto size-8 text-muted" strokeWidth={1.5} />
            <p className="mt-3 font-display text-2xl">{hud.loading}</p>
          </div>
        </div>
      ) : null}

      {!hud.locked && !hud.pad && !hud.menuOpen && !hud.paused && !hud.loading ? (
        <button
          type="button"
          className="absolute inset-0 z-10 grid place-items-center bg-bg/40"
          onClick={() => e?.requestLock()}
        >
          <span className="rounded-md bg-surface px-5 py-3 text-sm ring-1 ring-line">
            Click to play · WASD · M menu · Xbox A to start
          </span>
        </button>
      ) : null}

      {hud.locked ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <Crosshair className="size-5 text-fg/70" strokeWidth={1.75} />
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-md bg-surface/80 px-3 py-2 text-sm ring-1 ring-line">
        <span className="font-mono tabular-nums text-wood">{hud.wood}</span>
        <span className="text-muted">wood</span>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-md bg-surface/80 px-3 py-2 text-xs text-muted ring-1 ring-line">
        {hud.cam === "third" ? "Chase" : "First"} · {hud.buildMode ? "Build" : "Tools"}
        {hud.pad ? " · Pad" : ""}
      </div>

      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {hud.buildMode ? (
          <>
            <Hot keyn="1" label="Floor" active={hud.part === "floor"} icon={<Box className="size-4" />} />
            <Hot keyn="2" label="Wall" active={hud.part === "wall"} icon={<Hammer className="size-4" />} />
          </>
        ) : (
          <>
            <Hot keyn="1" label="Axe" active={hud.tool === "axe"} icon={<Trees className="size-4" />} />
            <Hot keyn="2" label="Gun" active={hud.tool === "gun"} icon={<Swords className="size-4" />} />
          </>
        )}
      </div>

      {hud.hint ? (
        <p className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 text-xs text-accent">
          {hud.hint}
        </p>
      ) : null}

      {hud.menuOpen ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-bg/55">
          <div className="relative size-64">
            <Radial
              label={hud.buildMode ? "Exit build" : "Build"}
              onClick={() => e?.setBuildMode(!hud.buildMode)}
            />
            <button
              type="button"
              onClick={() => e?.closeMenu()}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface px-4 py-2 text-xs ring-1 ring-line"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {hud.paused || opts ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-bg/70 p-4">
          {opts ? (
            <OptionsPanel
              onClose={() => {
                setOpts(false);
                e?.setPaused(true);
              }}
            />
          ) : (
            <div className="flex w-full max-w-sm flex-col gap-2 rounded-xl bg-surface p-6 ring-1 ring-line">
              <p className="font-display text-2xl">Paused</p>
              <button
                type="button"
                onClick={() => e?.setPaused(false)}
                className="mt-2 rounded-md bg-accent px-4 py-3 font-medium text-accent-fg"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => setOpts(true)}
                className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 ring-1 ring-line"
              >
                <Settings2 className="size-4" /> Options
              </button>
              <button
                type="button"
                onClick={onQuit}
                className="inline-flex items-center justify-center gap-2 py-3 text-sm text-muted hover:text-fg"
              >
                <LogOut className="size-4" /> Quit to hub
              </button>
            </div>
          )}
        </div>
      ) : null}

      <button
        type="button"
        className="absolute right-4 bottom-5 z-10 rounded-full bg-surface p-3 ring-1 ring-line md:hidden"
        onClick={() => e?.setPaused(true)}
        aria-label="Pause"
      >
        <Pause className="size-4" />
      </button>

      <div
        className="absolute bottom-8 left-6 z-10 size-28 rounded-full bg-surface/50 ring-1 ring-line md:hidden"
        onPointerDown={(ev) => {
          const r = ev.currentTarget.getBoundingClientRect();
          stick.current = {
            id: ev.pointerId,
            cx: r.left + r.width / 2,
            cy: r.top + r.height / 2,
            x: 0,
            y: 0,
          };
          ev.currentTarget.setPointerCapture(ev.pointerId);
        }}
        onPointerMove={(ev) => {
          if (!stick.current || stick.current.id !== ev.pointerId) return;
          const dx = (ev.clientX - stick.current.cx) / 52;
          const dy = (ev.clientY - stick.current.cy) / 52;
          const m = Math.hypot(dx, dy) || 1;
          const x = dx / Math.max(1, m);
          const y = -dy / Math.max(1, m);
          e?.setMoveStick(x, y);
        }}
        onPointerUp={() => {
          stick.current = null;
          e?.setMoveStick(0, 0);
        }}
      />
      <button
        type="button"
        className="absolute right-6 bottom-24 z-10 rounded-full bg-accent px-5 py-4 text-sm font-medium text-accent-fg md:hidden"
        onPointerDown={() => e?.holdFire(true)}
        onPointerUp={() => e?.holdFire(false)}
      >
        Use
      </button>
      <button
        type="button"
        className="absolute left-36 bottom-8 z-10 rounded-full bg-surface px-4 py-3 text-xs ring-1 ring-line md:hidden"
        onClick={() => e?.toggleMenu()}
      >
        Menu
      </button>
    </div>
  );
}

function Hot({
  label,
  active,
  icon,
  keyn,
}: {
  label: string;
  active: boolean;
  icon: ReactNode;
  keyn: string;
}) {
  return (
    <div
      className={
        "flex min-w-20 flex-col items-center gap-1 rounded-md px-3 py-2 text-xs ring-1 " +
        (active ? "bg-raised ring-accent text-fg" : "bg-surface/80 ring-line text-muted")
      }
    >
      {icon}
      <span>{label}</span>
      <span className="font-mono text-[10px] text-subtle">{keyn}</span>
    </div>
  );
}

function Radial({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute left-1/2 top-0 -translate-x-1/2 rounded-md bg-accent px-5 py-3 text-sm font-medium text-accent-fg"
    >
      {label}
    </button>
  );
}
