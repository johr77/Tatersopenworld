"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACTION_LABELS,
  type ActionId,
  beginRebind,
  cancelRebind,
  initInput,
  isRebinding,
  mouse,
  padState,
  prettyBinding,
  resetBindings,
  saveSettings,
  setInputMuted,
  settings,
  touchLook,
  touchMove,
  pollMenu,
  type MenuNav,
} from "./input";
import { gameState } from "./state";
import { unlockAudio } from "./audio";
import {
  LOOKS,
  lookLabel,
  loadPlayers,
  savePlayers,
  makeId,
  type LookId,
  type PlayerProfile,
} from "./profiles";

const BIND_ROWS: ActionId[] = [
  "forward",
  "back",
  "left",
  "right",
  "jump",
  "crouch",
  "sprint",
  "fire",
  "aim",
  "reload",
  "toggleView",
  "freeLook",
  "nextWeapon",
  "prevWeapon",
  "menu",
];

function lockPointer(el: HTMLElement | null) {
  if (!el) return;
  const canvas = el.querySelector("canvas");
  const target = canvas ?? el;
  const req = target.requestPointerLock as (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
  try {
    const p = req.call(target, { unadjustedMovement: true });
    if (p && typeof (p as Promise<void>).catch === "function") {
      (p as Promise<void>).catch(() => target.requestPointerLock());
    }
  } catch {
    target.requestPointerLock();
  }
}

function Stick({
  side,
  onChange,
}: {
  side: "left" | "right";
  onChange: (x: number, y: number) => void;
}) {
  const origin = useRef({ x: 0, y: 0, id: -1 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    if (origin.current.id !== e.pointerId) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    const max = 36;
    const m = Math.hypot(dx, dy);
    const s = m > max ? max / m : 1;
    const x = (dx * s) / max;
    const y = (-dy * s) / max;
    setKnob({ x: dx * s, y: dy * s });
    onChange(x, y);
  };
  const onUp = (e: React.PointerEvent) => {
    if (origin.current.id !== e.pointerId) return;
    origin.current.id = -1;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      className={`touch-stick ${side === "left" ? "touch-stick-left" : "touch-stick-right"}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span className="touch-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function OptionsPanel({ onClose, nav }: { onClose: () => void; nav: MenuNav | null }) {
  const [, setTick] = useState(0);
  const [listen, setListen] = useState<ActionId | null>(null);
  const [focus, setFocus] = useState(BIND_ROWS.length + 1);
  const n = BIND_ROWS.length + 2;

  const refresh = () => setTick((x) => x + 1);

  const rebind = (id: ActionId) => {
    setListen(id);
    beginRebind(id, () => {
      setListen(null);
      refresh();
    });
  };

  useEffect(() => {
    if (!nav || isRebinding()) return;
    if (nav.down) setFocus((i) => (i + 1) % n);
    if (nav.up) setFocus((i) => (i - 1 + n) % n);
    if (nav.ok) {
      if (focus < BIND_ROWS.length) rebind(BIND_ROWS[focus]);
      else if (focus === BIND_ROWS.length) {
        resetBindings();
        cancelRebind();
        setListen(null);
        refresh();
      } else onClose();
    }
    if (nav.back) onClose();
  }, [nav]);

  return (
    <div
      className="start-overlay options-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRebinding()) onClose();
      }}
    >
      <div className="start-card options-card">
        <p className="start-kicker">Controller</p>
        <h2 className="options-title">Options</h2>
        <p className="start-copy">
          Keyboard stays on. Xbox: left stick move, right stick look. Hold Alt / RS-click
          to peek, then it snaps back. 1–3 switch guns.
        </p>

        <div className="options-grid">
          <label className="opt-row">
            <span>Mouse look</span>
            <input
              type="range"
              min={0.4}
              max={2.2}
              step={0.05}
              value={settings.mouseSens}
              onChange={(e) => {
                settings.mouseSens = Number(e.target.value);
                saveSettings();
                refresh();
              }}
            />
          </label>
          <label className="opt-row">
            <span>Stick look</span>
            <input
              type="range"
              min={0.4}
              max={2.2}
              step={0.05}
              value={settings.stickSens}
              onChange={(e) => {
                settings.stickSens = Number(e.target.value);
                saveSettings();
                refresh();
              }}
            />
          </label>
          <label className="opt-row">
            <span>Deadzone</span>
            <input
              type="range"
              min={0.06}
              max={0.35}
              step={0.01}
              value={settings.deadzone}
              onChange={(e) => {
                settings.deadzone = Number(e.target.value);
                saveSettings();
                refresh();
              }}
            />
          </label>
          <label className="opt-check">
            <input
              type="checkbox"
              checked={settings.invertY}
              onChange={(e) => {
                settings.invertY = e.target.checked;
                saveSettings();
                refresh();
              }}
            />
            Invert look Y
          </label>
          <label className="opt-check">
            <input
              type="checkbox"
              checked={settings.snapBack}
              onChange={(e) => {
                settings.snapBack = e.target.checked;
                saveSettings();
                refresh();
              }}
            />
            Right stick snaps back
          </label>
        </div>

        <p className="bind-hint">
          {listen
            ? `Press a key or Xbox button for ${ACTION_LABELS[listen]} (Esc cancels)`
            : "Click a bind, then press a key or Xbox button"}
        </p>
        <ul className="bind-list">
          {BIND_ROWS.map((id, i) => (
            <li key={id}>
              <span>{ACTION_LABELS[id]}</span>
              <button
                type="button"
                className={`bind-btn ${listen === id ? "listening" : ""}`}
                data-focus={focus === i ? "1" : "0"}
                onClick={() => rebind(id)}
              >
                {listen === id ? "Waiting…" : prettyBinding(id)}
              </button>
            </li>
          ))}
        </ul>

        <div className="options-actions">
          <button
            type="button"
            className="touch-btn"
            data-focus={focus === BIND_ROWS.length ? "1" : "0"}
            onClick={() => {
              resetBindings();
              cancelRebind();
              setListen(null);
              refresh();
            }}
          >
            Reset
          </button>
          <button type="button" className="start-btn" data-focus={focus === BIND_ROWS.length + 1 ? "1" : "0"} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Roster({
  players,
  onPlay,
  onNew,
  onDelete,
  focus,
}: {
  players: PlayerProfile[];
  onPlay: (p: PlayerProfile) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  focus: number;
}) {
  return (
    <div className="start-overlay lobby">
      <div className="lobby-panel">
        <p className="start-kicker">Taters range</p>
        <h1 className="start-title">Players</h1>
        <p className="start-copy">Make a shooter, then pick them to walk onto the range.</p>
        {players.length === 0 ? (
          <p className="empty-note">No one yet. Make a player to start.</p>
        ) : (
          <ul className="player-list">
            {players.map((p, i) => (
              <li key={p.id} className="player-row">
                <button
                  type="button"
                  className="player-pick"
                  data-focus={focus === i ? "1" : "0"}
                  onClick={() => onPlay(p)}
                >
                  <span className="player-name">{p.name}</span>
                  <span className="player-look">{lookLabel(p.look)}</span>
                </button>
                <button type="button" className="player-x" onClick={() => onDelete(p.id)} aria-label={`Remove ${p.name}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="options-actions">
          <button type="button" className="start-btn" data-focus={focus === players.length ? "1" : "0"} onClick={onNew}>
            New player
          </button>
        </div>
        <p className="pad-hint">Xbox: D-pad move · A select · B back · Menu options</p>
      </div>
    </div>
  );
}

function Creator({
  onSave,
  onBack,
  focus,
  nav,
}: {
  onSave: (name: string, look: LookId) => void;
  onBack: () => void;
  focus: number;
  nav: MenuNav | null;
}) {
  const [name, setName] = useState("");
  const [look, setLook] = useState<LookId>(gameState.look);

  const pick = (id: LookId) => {
    setLook(id);
    gameState.look = id;
  };

  const lookStart = 1;
  const backI = 1 + LOOKS.length;
  const confirmI = backI + 1;

  useEffect(() => {
    if (!nav) return;
    if (nav.back) onBack();
    if (!nav.ok) return;
    if (focus >= lookStart && focus < lookStart + LOOKS.length) pick(LOOKS[focus - lookStart].id);
    else if (focus === backI) onBack();
    else if (focus === confirmI) {
      const n = name.trim() || "Player";
      onSave(n, look);
    }
  }, [nav]);

  return (
    <div className="start-overlay lobby">
      <div className="lobby-panel">
        <p className="start-kicker">New player</p>
        <h1 className="start-title">Looks</h1>
        <p className="start-copy">Name them, pick clothes. Confirm sends you back to the list.</p>
        <label className="field" data-focus={focus === 0 ? "1" : "0"}>
          <span>Name</span>
          <input
            autoFocus
            maxLength={18}
            value={name}
            placeholder="Call sign"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
        <div className="look-grid">
          {LOOKS.map((row, i) => (
            <button
              key={row.id}
              type="button"
              className={`look-card${row.id === "mannequin" ? " look-wide" : ""}`}
              data-on={look === row.id ? "1" : "0"}
              data-focus={focus === lookStart + i ? "1" : "0"}
              onClick={() => pick(row.id)}
            >
              <span className="look-sex">{row.tag}</span>
              <span className="look-name">{row.label}</span>
            </button>
          ))}
        </div>
        <div className="options-actions">
          <button type="button" className="touch-btn" data-focus={focus === backI ? "1" : "0"} onClick={onBack}>
            Back
          </button>
          <button
            type="button"
            className="start-btn"
            data-focus={focus === confirmI ? "1" : "0"}
            disabled={false}
            onClick={() => onSave(name.trim() || "Player", look)}
          >
            Confirm
          </button>
        </div>
        <p className="pad-hint">Xbox: D-pad move · A select · B back</p>
      </div>
    </div>
  );
}

export function Hud({ hostRef }: { hostRef: React.RefObject<HTMLDivElement | null> }) {
  const [, setTick] = useState(0);
  const [playing, setPlaying] = useState(() => gameState.playing);
  const [menu, setMenu] = useState(false);
  const [screen, setScreen] = useState<"roster" | "create">("roster");
  const [players, setPlayers] = useState<PlayerProfile[]>(() => loadPlayers());
  const [focus, setFocus] = useState(0);
  const [nav, setNav] = useState<MenuNav | null>(null);

  const playingRef = useRef(playing);
  const menuRef = useRef(menu);
  const screenRef = useRef(screen);
  const playersRef = useRef(players);
  const focusRef = useRef(focus);
  playingRef.current = playing;
  menuRef.current = menu;
  screenRef.current = screen;
  playersRef.current = players;
  focusRef.current = focus;
  const startRef = useRef<(p: PlayerProfile) => void>(() => {});
  const newRef = useRef<() => void>(() => {});

  useEffect(() => {
    initInput();
    let last = 0;
    let id = 0;
    const loop = (t: number) => {
      const n = pollMenu();
      const has =
        n.up || n.down || n.left || n.right || n.ok || n.back || n.menu;
      if (has) {
        if (n.menu && playingRef.current && !menuRef.current && !isRebinding()) {
          setMenu(true);
        } else if (!playingRef.current && !menuRef.current) {
          const scr = screenRef.current;
          const list = playersRef.current;
          let i = focusRef.current;
          if (scr === "roster") {
            const count = list.length + 1;
            if (n.down || n.right) i = (i + 1) % count;
            if (n.up || n.left) i = (i - 1 + count) % count;
            if (i !== focusRef.current) {
              focusRef.current = i;
              setFocus(i);
            }
            if (n.ok) {
              if (i < list.length) startRef.current(list[i]);
              else newRef.current();
            }
          } else {
            const count = 1 + LOOKS.length + 2;
            const cols = n.left || n.right ? 1 : 2;
            if (n.down) i = (i + 2) % count;
            if (n.up) i = (i - 2 + count) % count;
            if (n.right) i = (i + 1) % count;
            if (n.left) i = (i - 1 + count) % count;
            if (i !== focusRef.current) {
              focusRef.current = i;
              setFocus(i);
            }
          }
        }
        setNav(n);
      } else {
        setNav(null);
      }
      if (t - last > 50) {
        last = t;
        if (gameState.menuPulse) {
          gameState.menuPulse = false;
          setMenu((open) => !open);
        }
        setTick((x) => x + 1);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setInputMuted(menu || !playing);
    if (menu) {
      cancelRebind();
      document.exitPointerLock?.();
    }
  }, [menu, playing]);

  const start = (profile: PlayerProfile) => {
    unlockAudio();
    gameState.look = profile.look;
    gameState.playerName = profile.name;
    setPlaying(true);
    gameState.playing = true;
    setMenu(false);
    lockPointer(hostRef.current);
  };
  startRef.current = start;
  newRef.current = () => {
    setScreen("create");
    setFocus(0);
    focusRef.current = 0;
  };

  const makePlayer = (name: string, look: LookId) => {
    const next = [...players, { id: makeId(), name, look, created: Date.now() }];
    setPlayers(next);
    savePlayers(next);
    gameState.look = look;
    setScreen("roster");
    setFocus(0);
    focusRef.current = 0;
  };

  const dropPlayer = (id: string) => {
    const next = players.filter((p) => p.id !== id);
    setPlayers(next);
    savePlayers(next);
  };

  const closeMenu = () => {
    setMenu(false);
    if (playing) lockPointer(hostRef.current);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let unlockFromEsc = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      if (!playing) return;
      if (isRebinding()) return;
      unlockFromEsc = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      if (!playing || menu) return;
      if (isRebinding()) return;
      setMenu(true);
      unlockFromEsc = false;
    };
    const onLock = () => {
      const canvas = host.querySelector("canvas");
      const locked = document.pointerLockElement === canvas;
      mouse.locked = locked;
      gameState.locked = locked;
      if (!locked && playing && !menu && unlockFromEsc) {
        setMenu(true);
        unlockFromEsc = false;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!playing || menu) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("button, a, input, .bind-btn, .touch-stick, .touch-actions, .options-overlay")) return;
      const canvas = host.querySelector("canvas");
      if (document.pointerLockElement === canvas) return;
      mouse.fireHeld = false;
      mouse.aimHeld = false;
      unlockFromEsc = false;
      lockPointer(host);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("pointerlockchange", onLock);
    host.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("pointerlockchange", onLock);
      host.removeEventListener("pointerdown", onDown);
    };
  }, [playing, menu, hostRef]);

  const stance = gameState.crouched
    ? "Crouch"
    : gameState.sprinting
      ? "Sprint"
      : gameState.speed > 0.45
        ? "Walk"
        : "Idle";

  return (
    <div className="hud-root">
      {!playing && screen === "roster" && (
        <Roster
          players={players}
          onPlay={start}
          onNew={() => {
            gameState.look = gameState.look || "male-ranger";
            setScreen("create");
            setFocus(0);
            focusRef.current = 0;
          }}
          onDelete={dropPlayer}
          focus={focus}
        />
      )}
      {!playing && screen === "create" && (
        <Creator
          onSave={makePlayer}
          onBack={() => {
            setScreen("roster");
            setFocus(0);
            focusRef.current = 0;
          }}
          focus={focus}
          nav={nav}
        />
      )}

      {menu && <OptionsPanel onClose={playing ? closeMenu : () => setMenu(false)} nav={nav} />}

      {playing && (
        <>
          <div className="crosshair" data-aim={gameState.aiming ? "1" : "0"} />
          <div className="hud-top">
            <div className="hud-chip">
              <span className="hud-label">Player</span>
              <span className="hud-value">{gameState.playerName || "—"}</span>
            </div>
            <div className="hud-chip">
              <span className="hud-label">Anim</span>
              <span className="hud-value">{gameState.clip}</span>
            </div>
            <div className="hud-chip">
              <span className="hud-label">View</span>
              <span className="hud-value">{gameState.view === "fps" ? "Sights" : "Character"}</span>
            </div>
            <div className="hud-chip">
              <span className="hud-label">Hits</span>
              <span className="hud-value tabular">{gameState.hits}</span>
            </div>
            <div className="hud-chip">
              <span className="hud-label">Gun</span>
              <span className="hud-value">{gameState.weapon}</span>
            </div>
            <button type="button" className="hud-opt-btn" onClick={() => setMenu(true)}>
              Options
            </button>
          </div>
          <div className="hud-bottom">
            <div className="hud-chip">
              <span className="hud-label">Stance</span>
              <span className="hud-value">{stance}</span>
            </div>
            {padState.connected && (
              <div className="hud-chip">
                <span className="hud-label">Pad</span>
                <span className="hud-value">Xbox</span>
              </div>
            )}
            <div className="hud-ammo">
              <span className="hud-ammo-mag tabular">
                {gameState.reloading ? "REL" : String(gameState.ammo).padStart(2, "0")}
              </span>
              <span className="hud-ammo-res tabular">/ {gameState.reserve}</span>
            </div>
          </div>
        </>
      )}

      {playing && !menu && (
        <div className="touch-layer">
          <Stick
            side="left"
            onChange={(x, y) => {
              touchMove.x = x;
              touchMove.y = y;
            }}
          />
          <div className="touch-actions">
            <button
              type="button"
              className="touch-btn"
              onPointerDown={() => {
                mouse.fireHeld = true;
              }}
              onPointerUp={() => {
                mouse.fireHeld = false;
              }}
              onPointerCancel={() => {
                mouse.fireHeld = false;
              }}
            >
              Fire
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => lockPointer(hostRef.current)}>
              Look
            </button>
          </div>
          <Stick
            side="right"
            onChange={(x, y) => {
              touchLook.x = x * 1.1;
              touchLook.y = y * 1.1;
            }}
          />
        </div>
      )}
    </div>
  );
}
