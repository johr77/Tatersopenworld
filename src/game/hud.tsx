"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ACTION_LABELS,
  type ActionId,
  beginRebind,
  cancelRebind,
  initInput,
  isRebinding,
  mouse,
  padState,
  prettyKeys,
  prettyPad,
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

function takeNav(nav: MenuNav | null, seen: { current: number }): MenuNav | null {
  if (!nav || nav.seq === 0 || nav.seq === seen.current) return null;
  seen.current = nav.seq;
  return nav;
}

const KEY_ROWS: ActionId[] = [
  "forward",
  "back",
  "left",
  "right",
  "jump",
  "crouch",
  "sprint",
  "fire",
  "aim",
  "use",
  "reload",
  "toggleView",
  "freeLook",
  "alignCam",
  "nextWeapon",
  "prevWeapon",
  "menu",
];

const PAD_ROWS: ActionId[] = [
  "use",
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

function StrandIcon() {
  return (
    <svg className="inv-log" viewBox="0 0 64 40" aria-hidden="true">
      <path d="M18 38 C16 22 22 8 20 2" fill="none" stroke="#6a8f3a" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 38 C34 20 28 10 33 2" fill="none" stroke="#8aaa4a" strokeWidth="3" strokeLinecap="round" />
      <path d="M46 38 C48 24 42 12 45 4" fill="none" stroke="#5c7a32" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
  const [focus, setFocus] = useState(0);
  const seen = useRef(nav?.seq ?? 0);
  const focusRef = useRef(0);
  focusRef.current = focus;
  useEffect(() => {
    const n = takeNav(nav, seen);
    if (!n) return;
    if (n.down) setFocus((i) => (i + 1) % (INV_SIZE + 1));
    if (n.up) setFocus((i) => (i - 1 + INV_SIZE + 1) % (INV_SIZE + 1));
    if (n.back || n.menu) onBack();
    else if (n.ok && focusRef.current === INV_SIZE) onBack();
  }, [nav]);
  return (
    <div className="start-overlay options-overlay" onClick={(e) => { if (e.target === e.currentTarget) onBack(); }}>
      <div className="start-card options-card">
        <p className="start-kicker">{gameState.playerName || "Player"}</p>
        <h2 className="options-title">Inventory</h2>
        <p className="start-copy">Six pockets. Chop pines for wood. Pick wispy weeds (E / X) for strand.</p>
        <div className="inv-grid">
          {slots.map((slot, i) => (
            <div key={i} className="inv-slot" data-focus={focus === i ? "1" : "0"} data-filled={slot ? "1" : "0"}>
              {slot ? (
                <>
                  <span className="inv-count tabular">{slot.count}</span>
                  {slot.id === "strand" ? <StrandIcon /> : <LogIcon />}
                  <span className="inv-name">{ITEM_LABEL[slot.id]}</span>
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

function DeviceBinds({
  rows,
  kind,
  nav,
  onBack,
  extra,
}: {
  rows: ActionId[];
  kind: "key" | "button";
  nav: MenuNav | null;
  onBack: () => void;
  extra: ReactNode;
}) {
  const [, setTick] = useState(0);
  const [listen, setListen] = useState<ActionId | null>(null);
  const [focus, setFocus] = useState(0);
  const seen = useRef(nav?.seq ?? 0);
  const focusRef = useRef(0);
  focusRef.current = focus;
  const cardRef = useRef<HTMLDivElement>(null);
  const n = rows.length + 2;
  const refresh = () => setTick((x) => x + 1);
  const rebind = (id: ActionId) => {
    setListen(id);
    beginRebind(
      id,
      () => {
        setListen(null);
        refresh();
      },
      kind,
    );
  };
  useEffect(() => {
    const nNav = takeNav(nav, seen);
    if (!nNav) return;
    if (isRebinding()) return;
    if (nNav.down) setFocus((i) => (i + 1) % n);
    if (nNav.up) setFocus((i) => (i - 1 + n) % n);
    if (nNav.ok) {
      const at = focusRef.current;
      if (at < rows.length) rebind(rows[at]!);
      else if (at === rows.length) {
        resetBindings();
        cancelRebind();
        setListen(null);
        refresh();
      } else onBack();
    }
    if (nNav.back || nNav.menu) onBack();
  }, [nav]);
  useEffect(() => {
    const el = cardRef.current?.querySelector("[data-focus='1']");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);
  return (
    <div className="start-overlay options-overlay" onClick={(e) => { if (e.target === e.currentTarget && !isRebinding()) onBack(); }}>
      <div className="start-card options-card" ref={cardRef}>
        <p className="start-kicker">Controls</p>
        <h2 className="options-title">{kind === "button" ? "Gamepad" : "Keyboard"}</h2>
        {extra}
        <p className="bind-hint">
          {listen
            ? kind === "button"
              ? `Waiting for ${ACTION_LABELS[listen]} — press the new button (Esc cancels)`
              : `Press a key for ${ACTION_LABELS[listen]} (Esc cancels)`
            : kind === "button"
              ? "A selects a bind, then press an Xbox button"
              : "A selects a bind, then press a key"}
        </p>
        <ul className="bind-list">
          {rows.map((id, i) => (
            <li key={id}>
              <span>{ACTION_LABELS[id]}</span>
              <button type="button" className={`bind-btn ${listen === id ? "listening" : ""}`} data-focus={focus === i ? "1" : "0"} onClick={() => rebind(id)}>
                {listen === id ? "Waiting…" : kind === "button" ? prettyPad(id) : prettyKeys(id)}
              </button>
            </li>
          ))}
        </ul>
        <div className="options-actions">
          <button type="button" className="touch-btn" data-focus={focus === rows.length ? "1" : "0"} onClick={() => { resetBindings(); cancelRebind(); setListen(null); refresh(); }}>
            Reset
          </button>
          <button type="button" className="start-btn" data-focus={focus === rows.length + 1 ? "1" : "0"} onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlsHub({
  onBack,
  onClose,
  nav,
}: {
  onBack: () => void;
  onClose: () => void;
  nav: MenuNav | null;
}) {
  const [pane, setPane] = useState<"hub" | "pad" | "keys">("hub");
  const [focus, setFocus] = useState(0);
  const seen = useRef(nav?.seq ?? 0);
  const [, setTick] = useState(0);
  const refresh = () => setTick((x) => x + 1);
  const count = 4;

  const focusRef = useRef(0);
  focusRef.current = focus;
  useEffect(() => {
    if (pane !== "hub") {
      if (nav?.seq) seen.current = nav.seq;
      return;
    }
    const n = takeNav(nav, seen);
    if (!n) return;
    if (n.down) setFocus((i) => (i + 1) % count);
    if (n.up) setFocus((i) => (i - 1 + count) % count);
    if (n.ok) {
      const at = focusRef.current;
      if (at === 0) setPane("pad");
      else if (at === 1) setPane("keys");
      else if (at === 2) return;
      else onBack();
    }
    if (n.back) onBack();
    if (n.menu) onClose();
  }, [nav, pane, onBack, onClose]);

  if (pane === "pad") {
    return (
      <DeviceBinds
        rows={PAD_ROWS}
        kind="button"
        nav={nav}
        onBack={() => setPane("hub")}
        extra={
          <div className="options-grid">
            <p className="start-copy">Left stick move. Right stick look. X is Action (pick / open / use).</p>
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
        }
      />
    );
  }
  if (pane === "keys") {
    return (
      <DeviceBinds
        rows={KEY_ROWS}
        kind="key"
        nav={nav}
        onBack={() => setPane("hub")}
        extra={
          <div className="options-grid">
            <p className="start-copy">WASD move. E is Action. Mouse look while the pointer is locked.</p>
            <label className="opt-row">
              <span>Mouse look</span>
              <input type="range" min={0.4} max={2.2} step={0.05} value={settings.mouseSens} onChange={(e) => { settings.mouseSens = Number(e.target.value); saveSettings(); refresh(); }} />
            </label>
            <label className="opt-check">
              <input type="checkbox" checked={settings.invertY} onChange={(e) => { settings.invertY = e.target.checked; saveSettings(); refresh(); }} />
              Invert look Y
            </label>
          </div>
        }
      />
    );
  }

  return (
    <div className="start-overlay options-overlay" onClick={(e) => { if (e.target === e.currentTarget) onBack(); }}>
      <div className="start-card options-card">
        <p className="start-kicker">Paused</p>
        <h2 className="options-title">Controls</h2>
        <p className="start-copy">Pick a device. D-pad up/down, A select, B back.</p>
        <div className="options-actions menu-stack">
          <button type="button" className="start-btn" data-focus={focus === 0 ? "1" : "0"} onClick={() => setPane("pad")}>
            Gamepad
          </button>
          <button type="button" className="touch-btn" data-focus={focus === 1 ? "1" : "0"} onClick={() => setPane("keys")}>
            Keyboard &amp; mouse
          </button>
          <button type="button" className="touch-btn later-btn" data-focus={focus === 2 ? "1" : "0"} disabled>
            Phone — later
          </button>
          <button type="button" className="touch-btn" data-focus={focus === 3 ? "1" : "0"} onClick={onBack}>
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
  const seen = useRef(0);
  const opened = useRef(performance.now());
  const focusRef = useRef(0);
  focusRef.current = focus;
  const items = onPlayers ? 4 : 3;

  useEffect(() => {
    if (pane !== "root") {
      if (nav?.seq) seen.current = nav.seq;
      return;
    }
    if (performance.now() - opened.current < 320) return;
    const n = takeNav(nav, seen);
    if (!n) return;
    if (n.down) setFocus((i) => (i + 1) % items);
    if (n.up) setFocus((i) => (i - 1 + items) % items);
    if (n.ok) {
      const at = focusRef.current;
      if (at === 0) setPane("inventory");
      else if (at === 1) setPane("controls");
      else if (onPlayers && at === 2) onPlayers();
      else onClose();
    }
    if (n.back || n.menu) onClose();
  }, [nav, pane, items, onClose, onPlayers]);

  if (pane === "inventory") return <InventoryPanel nav={nav} onBack={() => setPane("root")} />;
  if (pane === "controls") return <ControlsHub nav={nav} onBack={() => setPane("root")} onClose={onClose} />;

  return (
    <div className="start-overlay options-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="start-card options-card">
        <p className="start-kicker">Paused</p>
        <h2 className="options-title">Options</h2>
        <p className="start-copy">D-pad up/down · A select · B or Menu back</p>
        <div className="options-actions menu-stack">
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
            Resume
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

const KB_ROWS: string[][] = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
  ["spc", "del"],
];
const KB_FLAT = KB_ROWS.flat();
const KB_LEN = KB_FLAT.length;

function kbRowCol(i: number) {
  let n = 0;
  for (let r = 0; r < KB_ROWS.length; r++) {
    const row = KB_ROWS[r]!;
    if (i < n + row.length) return { r, c: i - n };
    n += row.length;
  }
  return { r: 0, c: 0 };
}

function kbAt(r: number, c: number) {
  const rr = Math.max(0, Math.min(KB_ROWS.length - 1, r));
  const row = KB_ROWS[rr]!;
  const cc = Math.max(0, Math.min(row.length - 1, c));
  let i = 0;
  for (let x = 0; x < rr; x++) i += KB_ROWS[x]!.length;
  return i + cc;
}

function Creator({
  onSave,
  onBack,
  nav,
}: {
  onSave: (name: string, look: LookId) => void;
  onBack: () => void;
  nav: MenuNav | null;
}) {
  const [name, setName] = useState("");
  const [look, setLook] = useState<LookId>("hero-female");
  const [focus, setFocus] = useState(0);
  const seen = useRef(nav?.seq ?? 0);
  const focusRef = useRef(0);
  const nameRef = useRef("");
  const lookRef = useRef(look);
  focusRef.current = focus;
  nameRef.current = name;
  lookRef.current = look;

  const lookStart = KB_LEN;
  const backI = lookStart + LOOKS.length;
  const confirmI = backI + 1;
  const lastI = confirmI;

  const pick = (id: LookId) => {
    setLook(id);
    gameState.look = id;
  };

  const typeKey = (key: string) => {
    if (key === "spc") setName((s) => (s.length >= 18 ? s : s + " "));
    else if (key === "del") setName((s) => s.slice(0, -1));
    else setName((s) => (s.length >= 18 ? s : s + key));
  };

  useEffect(() => {
    const n = takeNav(nav, seen);
    if (!n) return;
    const at = focusRef.current;
    if (n.back) {
      if (at < KB_LEN) {
        setName((s) => s.slice(0, -1));
        return;
      }
      onBack();
      return;
    }
    if (n.left || n.right || n.up || n.down) {
      if (at < KB_LEN) {
        const { r, c } = kbRowCol(at);
        if (n.left) setFocus(kbAt(r, c - 1));
        else if (n.right) setFocus(kbAt(r, c + 1));
        else if (n.up) {
          if (r === 0) setFocus(lastI);
          else setFocus(kbAt(r - 1, c));
        } else if (n.down) {
          if (r >= KB_ROWS.length - 1) setFocus(lookStart);
          else setFocus(kbAt(r + 1, c));
        }
        return;
      }
      if (n.down) setFocus((i) => Math.min(lastI, i + (at >= lookStart && at < backI ? LOOKS.length : 1)));
      if (n.up) {
        if (at === lookStart) setFocus(kbAt(KB_ROWS.length - 1, 0));
        else setFocus((i) => Math.max(0, i - (at >= lookStart && at < backI ? LOOKS.length : 1)));
      }
      if (n.left) setFocus((i) => Math.max(0, i - 1));
      if (n.right) setFocus((i) => Math.min(lastI, i + 1));
      return;
    }
    if (!n.ok) return;
    if (at < KB_LEN) typeKey(KB_FLAT[at]!);
    else if (at >= lookStart && at < backI) pick(LOOKS[at - lookStart]!.id);
    else if (at === backI) onBack();
    else onSave(nameRef.current.trim() || "Player", lookRef.current);
  }, [nav]);

  return (
    <div className="start-overlay lobby">
      <div className="lobby-panel">
        <p className="start-kicker">New player</p>
        <h1 className="start-title">Looks</h1>
        <p className="start-copy">Name them with the keyboard, then pick male or female.</p>
        <label className="field">
          <span>Name</span>
          <input
            maxLength={18}
            value={name}
            placeholder="Call sign"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
        <div className="osk" aria-label="On-screen keyboard">
          {KB_ROWS.map((row, ri) => (
            <div key={ri} className="osk-row">
              {row.map((key) => {
                const idx = KB_FLAT.indexOf(key);
                const label = key === "spc" ? "Space" : key === "del" ? "Del" : key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`osk-key${key === "spc" || key === "del" ? " osk-wide" : ""}`}
                    data-focus={focus === idx ? "1" : "0"}
                    onClick={() => typeKey(key)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
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
            onClick={() => onSave(name.trim() || "Player", look)}
          >
            Confirm
          </button>
        </div>
        <p className="pad-hint">Xbox: D-pad move · A type/select · B delete letter (or back)</p>
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
        if (n.menu && playingRef.current && !isRebinding()) {
          if (!menuRef.current) {
            setMenu(true);
            setNav(null);
          } else {
            setNav(n);
          }
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
          }
          setNav(n);
        } else {
          setNav(n);
        }
      } else {
        setNav(null);
      }
      if (t - last > 50) {
        last = t;
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
            gameState.look = "hero-female";
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
          {gameState.prompt ? <div className="use-prompt">{gameState.prompt} · E / X</div> : null}
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
                mouse.useHeld = true;
              }}
              onPointerUp={() => {
                mouse.useHeld = false;
              }}
              onPointerCancel={() => {
                mouse.useHeld = false;
              }}
            >
              Action
            </button>
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
