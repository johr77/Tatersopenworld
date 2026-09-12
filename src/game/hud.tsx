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
import { INV_SIZE, ITEM_LABEL, emptyInventory, migrateInventory, type InvSlot } from "./inventory";
import {
  CLOTH_SLOTS,
  STYLE_LABEL,
  cycleStyle,
  emptyLoadout,
  type ClothSlot,
  type Loadout,
} from "./wardrobe";

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
  "alignCam",
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

function LogIcon() {
  return (
    <svg className="inv-log" viewBox="0 0 64 40" aria-hidden="true">
      <ellipse cx="32" cy="20" rx="28" ry="14" fill="#8a5a32" />
      <ellipse cx="10" cy="20" rx="7" ry="14" fill="#d7b07a" stroke="#6b4223" strokeWidth="1.5" />
      <ellipse cx="10" cy="20" rx="3.2" ry="7" fill="#c48a4a" />
      <path d="M12 8.5 C40 4 54 10 58 20 C54 30 40 36 12 31" fill="none" stroke="#6b4223" strokeWidth="1.4" />
      <path d="M18 12 C36 10 48 16 50 20" fill="none" stroke="#c48a4a" strokeWidth="1.2" opacity="0.7" />
    </svg>
  );
}

function InventoryPanel({ onBack, nav }: { onBack: () => void; nav: MenuNav | null }) {
  const slots: InvSlot[] = gameState.inventory;
  const [focus, setFocus] = useState(INV_SIZE);
  useEffect(() => {
    if (!nav) return;
    if (nav.down || nav.right) setFocus((i) => (i + 1) % (INV_SIZE + 1));
    if (nav.up || nav.left) setFocus((i) => (i - 1 + INV_SIZE + 1) % (INV_SIZE + 1));
    if (nav.ok || nav.back) onBack();
  }, [nav]);
  return (
    <div className="start-overlay options-overlay" onClick={(e) => { if (e.target === e.currentTarget) onBack(); }}>
      <div className="start-card options-card">
        <p className="start-kicker">{gameState.playerName || "Player"}</p>
        <h2 className="options-title">Inventory</h2>
        <p className="start-copy">Six pockets. Backpacks will hold more later. Chop pines for wood.</p>
        <div className="inv-grid">
          {slots.map((slot, i) => (
            <div key={i} className="inv-slot" data-focus={focus === i ? "1" : "0"} data-filled={slot ? "1" : "0"}>
              {slot?.id === "wood" ? (
                <>
                  <span className="inv-count tabular">{slot.count}</span>
                  <LogIcon />
                  <span className="inv-name">{ITEM_LABEL.wood}</span>
                </>
              ) : (
                <span className="inv-empty">Empty</span>
              )}
            </div>
          ))}
        </div>
        <div className="options-actions">
          <button type="button" className="start-btn" data-focus={focus === INV_SIZE ? "1" : "0"} onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlsPanel({
  onBack,
  nav,
}: {
  onBack: () => void;
  nav: MenuNav | null;
}) {
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
      } else onBack();
    }
    if (nav.back) onBack();
  }, [nav]);
  return (
    <div className="start-overlay options-overlay" onClick={(e) => { if (e.target === e.currentTarget && !isRebinding()) onBack(); }}>
      <div className="start-card options-card">
        <p className="start-kicker">Controller</p>
        <h2 className="options-title">Controls</h2>
        <p className="start-copy">
          Keyboard stays on. Xbox: left stick move, right stick look. 1–4 switch guns and the axe.
        </p>
        <div className="options-grid">
          <label className="opt-row">
            <span>Mouse look</span>
            <input type="range" min={0.4} max={2.2} step={0.05} value={settings.mouseSens} onChange={(e) => { settings.mouseSens = Number(e.target.value); saveSettings(); refresh(); }} />
          </label>
          <label className="opt-row">
            <span>Stick look</span>
            <input type="range" min={0.4} max={2.2} step={0.05} value={settings.stickSens} onChange={(e) => { settings.stickSens = Number(e.target.value); saveSettings(); refresh(); }} />
          </label>
          <label className="opt-row">
            <span>Deadzone</span>
            <input type="range" min={0.06} max={0.35} step={0.01} value={settings.deadzone} onChange={(e) => { settings.deadzone = Number(e.target.value); saveSettings(); refresh(); }} />
          </label>
          <label className="opt-check">
            <input type="checkbox" checked={settings.invertY} onChange={(e) => { settings.invertY = e.target.checked; saveSettings(); refresh(); }} />
            Invert look Y
          </label>
          <label className="opt-check">
            <input type="checkbox" checked={settings.snapBack} onChange={(e) => { settings.snapBack = e.target.checked; saveSettings(); refresh(); }} />
            Right stick snaps back
          </label>
        </div>
        <p className="bind-hint">
          {listen ? `Press a key or Xbox button for ${ACTION_LABELS[listen]} (Esc cancels)` : "Click a bind, then press a key or Xbox button"}
        </p>
        <ul className="bind-list">
          {BIND_ROWS.map((id, i) => (
            <li key={id}>
              <span>{ACTION_LABELS[id]}</span>
              <button type="button" className={`bind-btn ${listen === id ? "listening" : ""}`} data-focus={focus === i ? "1" : "0"} onClick={() => rebind(id)}>
                {listen === id ? "Waiting…" : prettyBinding(id)}
              </button>
            </li>
          ))}
        </ul>
        <div className="options-actions">
          <button type="button" className="touch-btn" data-focus={focus === BIND_ROWS.length ? "1" : "0"} onClick={() => { resetBindings(); cancelRebind(); setListen(null); refresh(); }}>
            Reset
          </button>
          <button type="button" className="start-btn" data-focus={focus === BIND_ROWS.length + 1 ? "1" : "0"} onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionsPanel({
  onClose,
  onPlayers,
  nav,
}: {
  onClose: () => void;
  onPlayers?: () => void;
  nav: MenuNav | null;
}) {
  const [pane, setPane] = useState<"root" | "controls" | "inventory">("root");
  const [focus, setFocus] = useState(0);
  const items = onPlayers ? 4 : 3;

  useEffect(() => {
    if (!nav || pane !== "root") return;
    if (nav.down || nav.right) setFocus((i) => (i + 1) % items);
    if (nav.up || nav.left) setFocus((i) => (i - 1 + items) % items);
    if (nav.ok) {
      if (focus === 0) setPane("inventory");
      else if (focus === 1) setPane("controls");
      else if (onPlayers && focus === 2) onPlayers();
      else onClose();
    }
    if (nav.back) onClose();
  }, [nav, pane, focus, items, onClose, onPlayers]);

  if (pane === "inventory") return <InventoryPanel nav={nav} onBack={() => setPane("root")} />;
  if (pane === "controls") return <ControlsPanel nav={nav} onBack={() => setPane("root")} />;

  return (
    <div className="start-overlay options-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="start-card options-card">
        <p className="start-kicker">Paused</p>
        <h2 className="options-title">Options</h2>
        <p className="start-copy">Inventory for what you chop. Controls for binds and look.</p>
        <div className="options-actions menu-four">
          <button type="button" className="start-btn" data-focus={focus === 0 ? "1" : "0"} onClick={() => setPane("inventory")}>
            Inventory
          </button>
          <button type="button" className="touch-btn" data-focus={focus === 1 ? "1" : "0"} onClick={() => setPane("controls")}>
            Controls
          </button>
          {onPlayers && (
            <button type="button" className="touch-btn" data-focus={focus === 2 ? "1" : "0"} onClick={onPlayers}>
              Players
            </button>
          )}
          <button type="button" className="touch-btn" data-focus={focus === items - 1 ? "1" : "0"} onClick={onClose}>
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
        <p className="start-copy">Make a shooter, then pick them to kit out before the range.</p>
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
        <p className="start-copy">Name them, then pick male or female.</p>
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
              className="look-card"
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

function Setup({
  name,
  loadout,
  focus,
  onCycle,
  onBack,
  onPlay,
}: {
  name: string;
  loadout: Loadout;
  focus: number;
  onCycle: (slot: ClothSlot, dir: 1 | -1) => void;
  onBack: () => void;
  onPlay: () => void;
}) {
  const backI = CLOTH_SLOTS.length;
  const playI = backI + 1;
  return (
    <div className="start-overlay setup-overlay">
      <div className="lobby-panel setup-panel">
        <p className="start-kicker">{name}</p>
        <h1 className="start-title">Kit</h1>
        <p className="start-copy">A full set stays on. Only the head can come off. Swap peasant or ranger on each piece.</p>
        <ul className="kit-list">
          {CLOTH_SLOTS.map((slot, i) => (
            <li key={slot.id} className="kit-row" data-focus={focus === i ? "1" : "0"}>
              <span className="kit-label">{slot.label}</span>
              <button type="button" className="kit-step" onClick={() => onCycle(slot.id, -1)} aria-label={`Previous ${slot.label}`}>
                ‹
              </button>
              <span className="kit-value">{STYLE_LABEL[loadout[slot.id]]}</span>
              <button type="button" className="kit-step" onClick={() => onCycle(slot.id, 1)} aria-label={`Next ${slot.label}`}>
                ›
              </button>
            </li>
          ))}
        </ul>
        <div className="options-actions">
          <button type="button" className="touch-btn" data-focus={focus === backI ? "1" : "0"} onClick={onBack}>
            Back
          </button>
          <button type="button" className="start-btn" data-focus={focus === playI ? "1" : "0"} onClick={onPlay}>
            Play
          </button>
        </div>
        <p className="pad-hint">Xbox: D-pad up/down slots · left/right change · A play · B back</p>
      </div>
    </div>
  );
}

export function Hud({ hostRef }: { hostRef: React.RefObject<HTMLDivElement | null> }) {
  const [, setTick] = useState(0);
  const [playing, setPlaying] = useState(() => gameState.playing);
  const [menu, setMenu] = useState(false);
  const [screen, setScreen] = useState<"roster" | "create" | "setup">("roster");
  const [players, setPlayers] = useState<PlayerProfile[]>(() => loadPlayers());
  const [focus, setFocus] = useState(0);
  const [nav, setNav] = useState<MenuNav | null>(null);
  const [editing, setEditing] = useState<PlayerProfile | null>(null);
  const [kit, setKit] = useState<Loadout>(() => emptyLoadout());

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
  const kitCycleRef = useRef<(slot: ClothSlot, dir: 1 | -1) => void>(() => {});
  const kitPlayRef = useRef<() => void>(() => {});
  const kitBackRef = useRef<() => void>(() => {});

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
          } else if (scr === "setup") {
            const count = CLOTH_SLOTS.length + 2;
            if (n.down) i = (i + 1) % count;
            if (n.up) i = (i - 1 + count) % count;
            if (i !== focusRef.current) {
              focusRef.current = i;
              setFocus(i);
            }
            if (n.left || n.right) {
              if (i < CLOTH_SLOTS.length) kitCycleRef.current(CLOTH_SLOTS[i]!.id, n.right ? 1 : -1);
            }
            if (n.ok) {
              if (i < CLOTH_SLOTS.length) kitCycleRef.current(CLOTH_SLOTS[i]!.id, 1);
              else if (i === CLOTH_SLOTS.length) kitBackRef.current();
              else kitPlayRef.current();
            }
            if (n.back) kitBackRef.current();
          } else {
            const count = 1 + LOOKS.length + 2;
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
    const loadout = profile.loadout ?? emptyLoadout();
    gameState.look = profile.look;
    gameState.playerName = profile.name;
    gameState.playerId = profile.id;
    gameState.loadout = { ...loadout };
    gameState.inventory = migrateInventory(profile.inventory);
    gameState.setup = true;
    setEditing(profile);
    setKit({ ...loadout });
    setScreen("setup");
    setFocus(0);
    focusRef.current = 0;
    setPlaying(false);
    gameState.playing = false;
  };
  startRef.current = start;
  newRef.current = () => {
    gameState.setup = false;
    setScreen("create");
    setFocus(0);
    focusRef.current = 0;
  };

  const cycleKit = (slot: ClothSlot, dir: 1 | -1) => {
    setKit((prev) => {
      const next = { ...prev, [slot]: cycleStyle(slot, prev[slot], dir) };
      gameState.loadout = next;
      return next;
    });
  };
  kitCycleRef.current = cycleKit;

  const playFromSetup = () => {
    if (editing) {
      const next = players.map((p) => (p.id === editing.id ? { ...p, loadout: { ...kit } } : p));
      setPlayers(next);
      savePlayers(next);
    }
    gameState.loadout = { ...kit };
    gameState.setup = false;
    setPlaying(true);
    gameState.playing = true;
    setMenu(false);
    lockPointer(hostRef.current);
  };
  kitPlayRef.current = playFromSetup;

  const backFromSetup = () => {
    gameState.setup = false;
    gameState.loadout = emptyLoadout();
    setScreen("roster");
    setFocus(0);
    focusRef.current = 0;
    setEditing(null);
  };
  kitBackRef.current = backFromSetup;

  const makePlayer = (name: string, look: LookId) => {
    const next = [...players, { id: makeId(), name, look, loadout: emptyLoadout(), inventory: emptyInventory(), created: Date.now() }];
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

  const toRoster = () => {
    setPlaying(false);
    gameState.playing = false;
    gameState.setup = false;
    setMenu(false);
    setScreen("roster");
    setFocus(0);
    focusRef.current = 0;
    document.exitPointerLock?.();
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
            gameState.look = gameState.look || "hero-male";
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
      {!playing && screen === "setup" && (
        <Setup
          name={editing?.name || gameState.playerName || "Player"}
          loadout={kit}
          focus={focus}
          onCycle={cycleKit}
          onBack={backFromSetup}
          onPlay={playFromSetup}
        />
      )}

      {menu && (
        <OptionsPanel
          onClose={playing ? closeMenu : () => setMenu(false)}
          onPlayers={playing ? toRoster : undefined}
          nav={nav}
        />
      )}

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
              <span className="hud-value">
                {gameState.alignCam ? "Align" : gameState.view === "fps" ? "Sights" : "Character"}
              </span>
            </div>
            <div className="hud-chip">
              <span className="hud-label">Hits</span>
              <span className="hud-value tabular">{gameState.hits}</span>
            </div>
            <div className="hud-chip">
              <span className="hud-label">{gameState.weapon === "Axe" ? "Tool" : "Gun"}</span>
              <span className="hud-value">{gameState.weapon}</span>
            </div>
            <div className="hud-top-actions">
              <button type="button" className="hud-opt-btn" onClick={toRoster}>
                Players
              </button>
              <button type="button" className="hud-opt-btn" onClick={() => setMenu(true)}>
                Options
              </button>
            </div>
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
              {gameState.weapon === "Axe" ? (
                <span className="hud-ammo-mag">CHOP</span>
              ) : (
                <>
                  <span className="hud-ammo-mag tabular">
                    {gameState.reloading ? "REL" : String(gameState.ammo).padStart(2, "0")}
                  </span>
                  <span className="hud-ammo-res tabular">/ {gameState.reserve}</span>
                </>
              )}
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
