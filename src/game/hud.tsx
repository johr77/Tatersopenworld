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
  saveCurrentInventory,
  type LookId,
  type PlayerProfile,
} from "./profiles";
import {
  EQUIP_SLOTS,
  HAND_SLOTS,
  INV_SIZE,
  INV_COLS,
  ITEM_ICON,
  ITEM_LABEL,
  canFit,
  emptyCrate,
  emptyEquipment,
  ensureStarterGear,
  migrateCrate,
  migrateEquipment,
  migrateInventory,
  moveEquipToInv,
  moveInvToEquip,
  moveBetween,
  moveInvToInv,
  starterInventory,
  syncHands,
  CRATE_SIZE,
  type EquipSlotId,
  type InvSlot,
} from "./inventory";
import { emptyLoadout } from "./wardrobe";
import { PIECES, TRAY_DELETE, TRAY_DONE, cancelDelete, deleteAt, migrateBuildings, setBuildMode, setPiece, setTrayFocus, type PieceId } from "./build";

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

function PistolIcon() {
  return (
    <svg className="inv-log" viewBox="0 0 64 40" aria-hidden="true">
      <rect x="8" y="16" width="38" height="8" rx="2" fill="#4a4e52" />
      <rect x="40" y="14" width="16" height="6" rx="1" fill="#6a6e72" />
      <path d="M14 24 L12 36 L22 36 L24 24" fill="#3a2a22" />
    </svg>
  );
}

function ShotgunIcon() {
  return (
    <svg className="inv-log" viewBox="0 0 64 40" aria-hidden="true">
      <rect x="4" y="18" width="50" height="6" rx="2" fill="#4a4e52" />
      <rect x="40" y="16" width="18" height="10" rx="2" fill="#5c4030" />
      <rect x="8" y="14" width="10" height="4" fill="#6a6e72" />
    </svg>
  );
}

function StoneIcon() {
  return (
    <svg className="inv-log" viewBox="0 0 64 40" aria-hidden="true">
      <ellipse cx="32" cy="22" rx="16" ry="11" fill="#8b8680" />
      <ellipse cx="28" cy="19" rx="6" ry="4" fill="#a8a29c" opacity="0.7" />
    </svg>
  );
}

function AxeIcon() {
  return (
    <svg className="inv-log" viewBox="0 0 64 40" aria-hidden="true">
      <rect x="28" y="6" width="5" height="30" rx="1" fill="#6b4223" />
      <path d="M18 8 L46 8 L42 20 L22 20 Z" fill="#8a9096" />
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

function ItemGlyph({ id }: { id: NonNullable<InvSlot>["id"] }) {
  const [bad, setBad] = useState(false);
  if (!bad) {
    return (
      <img
        className="inv-icon"
        src={ITEM_ICON[id]}
        alt=""
        draggable={false}
        onError={() => setBad(true)}
      />
    );
  }
  if (id === "strand") return <StrandIcon />;
  if (id === "pistol") return <PistolIcon />;
  if (id === "shotgun") return <ShotgunIcon />;
  if (id === "axe") return <AxeIcon />;
  if (id === "stone") return <StoneIcon />;
  return <LogIcon />;
}

function SlotFace({ slot }: { slot: InvSlot }) {
  if (!slot) return <span className="inv-empty">Empty</span>;
  const showCount = slot.count > 1 || slot.id === "wood" || slot.id === "strand" || slot.id === "stone";
  return (
    <>
      {showCount ? <span className="inv-count tabular">{slot.count}</span> : null}
      <ItemGlyph id={slot.id} />
      <span className="inv-name">{ITEM_LABEL[slot.id]}</span>
    </>
  );
}

const KIT_COUNT = HAND_SLOTS.length;
const INV_BACK = KIT_COUNT + INV_SIZE;

type Held =
  | { kind: "inv"; i: number }
  | { kind: "eq"; id: EquipSlotId }
  | { kind: "crate"; i: number }
  | null;

function persistGear() {
  saveCurrentInventory();
  gameState.hands = syncHands(gameState.equipment, gameState.hands);
}

function matchingKit(item: InvSlot): EquipSlotId | null {
  if (!item) return null;
  const row = EQUIP_SLOTS.find((s) => canFit(s.id, item));
  return row?.id ?? null;
}

function firstEmptyPocket() {
  return gameState.inventory.findIndex((s) => !s);
}

function SlotCell({
  slot,
  focused,
  held,
  payload,
  onDropHeld,
}: {
  slot: InvSlot;
  focused: boolean;
  held: boolean;
  payload: Held;
  onDropHeld: (from: Held) => void;
}) {
  return (
    <div
      className="inv-slot"
      data-focus={focused ? "1" : "0"}
      data-filled={slot ? "1" : "0"}
      data-held={held ? "1" : "0"}
      draggable={Boolean(slot)}
      onDragStart={(e) => {
        if (!payload) return;
        e.dataTransfer.setData("text/plain", JSON.stringify(payload));
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        try {
          onDropHeld(JSON.parse(e.dataTransfer.getData("text/plain")) as Held);
        } catch {
          /* ignore */
        }
      }}
    >
      <SlotFace slot={slot} />
    </div>
  );
}

function PackGrid({
  focusBase,
  focus,
  held,
  onDrop,
}: {
  focusBase: number;
  focus: number;
  held: Held;
  onDrop: (i: number, from: Held) => void;
}) {
  return (
    <div className="inv-grid">
      {gameState.inventory.map((slot, i) => (
        <SlotCell
          key={i}
          slot={slot}
          focused={focus === focusBase + i}
          held={held?.kind === "inv" && held.i === i}
          payload={{ kind: "inv", i }}
          onDropHeld={(from) => onDrop(i, from)}
        />
      ))}
    </div>
  );
}

function ChestGrid({
  focus,
  held,
  onDrop,
}: {
  focus: number;
  held: Held;
  onDrop: (i: number, from: Held) => void;
}) {
  return (
    <div className="inv-grid">
      {gameState.crate.map((slot, i) => (
        <SlotCell
          key={i}
          slot={slot}
          focused={focus === i}
          held={held?.kind === "crate" && held.i === i}
          payload={{ kind: "crate", i }}
          onDropHeld={(from) => onDrop(i, from)}
        />
      ))}
    </div>
  );
}

function heldLabel(h: Held) {
  if (!h) return "";
  if (h.kind === "inv") return gameState.inventory[h.i] ? ITEM_LABEL[gameState.inventory[h.i]!.id] : "";
  if (h.kind === "crate") return gameState.crate[h.i] ? ITEM_LABEL[gameState.crate[h.i]!.id] : "";
  const item = gameState.equipment[h.id];
  return item ? ITEM_LABEL[item.id] : "";
}

function InventoryPanel({
  onBack,
  nav,
  mode = "kit",
}: {
  onBack: () => void;
  nav: MenuNav | null;
  mode?: "kit" | "crate";
}) {
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  const crateMode = mode === "crate";
  const closeIdx = crateMode ? CRATE_SIZE + INV_SIZE : INV_BACK;
  const [focus, setFocus] = useState(crateMode ? 0 : KIT_COUNT);
  const [held, setHeld] = useState<Held>(null);
  const seen = useRef(nav?.seq ?? 0);
  const focusRef = useRef(0);
  const heldRef = useRef<Held>(null);
  focusRef.current = focus;
  heldRef.current = held;
  const cardRef = useRef<HTMLDivElement>(null);

  const dropOnEq = (slot: EquipSlotId, from: Held) => {
    if (!from) return;
    if (from.kind === "inv") {
      if (moveInvToEquip(gameState.inventory, gameState.equipment, from.i, slot)) {
        if (slot === "weapon" || slot === "weapon2" || slot === "tool") gameState.hands = slot;
        persistGear();
        setHeld(null);
        refresh();
      }
      return;
    }
    if (from.kind !== "eq") return;
    if (from.id === slot) {
      setHeld(null);
      return;
    }
    const a = gameState.equipment[from.id];
    const b = gameState.equipment[slot];
    if (a && canFit(slot, a) && (!b || canFit(from.id, b))) {
      gameState.equipment[slot] = a;
      gameState.equipment[from.id] = b;
      persistGear();
      setHeld(null);
      refresh();
    }
  };

  const dropOnInv = (i: number, from: Held) => {
    if (!from) return;
    if (from.kind === "inv") {
      moveInvToInv(gameState.inventory, from.i, i);
      persistGear();
      setHeld(null);
      refresh();
      return;
    }
    if (from.kind === "crate") {
      moveBetween(gameState.crate, from.i, gameState.inventory, i);
      persistGear();
      setHeld(null);
      refresh();
      return;
    }
    if (from.kind === "eq" && moveEquipToInv(gameState.inventory, gameState.equipment, from.id, i)) {
      persistGear();
      setHeld(null);
      refresh();
    }
  };

  const dropOnCrate = (i: number, from: Held) => {
    if (!from) return;
    if (from.kind === "crate") {
      moveInvToInv(gameState.crate, from.i, i);
      persistGear();
      setHeld(null);
      refresh();
      return;
    }
    if (from.kind === "inv") {
      moveBetween(gameState.inventory, from.i, gameState.crate, i);
      persistGear();
      setHeld(null);
      refresh();
    }
  };

  const pickOrPlace = (kind: "inv" | "crate", i: number) => {
    const carry = heldRef.current;
    if (kind === "crate") {
      if (carry) dropOnCrate(i, carry);
      else if (gameState.crate[i]) setHeld({ kind: "crate", i });
      return;
    }
    if (carry) dropOnInv(i, carry);
    else if (gameState.inventory[i]) setHeld({ kind: "inv", i });
  };

  useEffect(() => {
    const n = takeNav(nav, seen);
    if (!n) return;
    const at = focusRef.current;
    const carry = heldRef.current;
    if (n.left || n.right || n.up || n.down) {
      if (crateMode) {
        if (at < CRATE_SIZE) {
          const r = Math.floor(at / INV_COLS);
          const c = at % INV_COLS;
          if (n.left && c > 0) setFocus(at - 1);
          else if (n.right) {
            if (c < INV_COLS - 1) setFocus(at + 1);
            else setFocus(CRATE_SIZE + r * INV_COLS);
          } else if (n.up) setFocus(r > 0 ? at - INV_COLS : closeIdx);
          else if (n.down) setFocus(at + INV_COLS < CRATE_SIZE ? at + INV_COLS : closeIdx);
          return;
        }
        if (at < closeIdx) {
          const i = at - CRATE_SIZE;
          const r = Math.floor(i / INV_COLS);
          const c = i % INV_COLS;
          if (n.left) {
            if (c > 0) setFocus(at - 1);
            else setFocus(r * INV_COLS + (INV_COLS - 1));
          } else if (n.right) {
            if (c < INV_COLS - 1 && i + 1 < INV_SIZE) setFocus(at + 1);
          } else if (n.up) setFocus(r > 0 ? at - INV_COLS : closeIdx);
          else if (n.down) setFocus(i + INV_COLS < INV_SIZE ? at + INV_COLS : closeIdx);
          return;
        }
        if (n.up) setFocus(CRATE_SIZE + INV_COLS * 2);
        else if (n.down) setFocus(0);
        else if (n.left) setFocus(CRATE_SIZE - 1);
        else if (n.right) setFocus(closeIdx - 1);
        return;
      }
      if (at < KIT_COUNT) {
        if (n.left) setFocus(at > 0 ? at - 1 : 0);
        else if (n.right) setFocus(at < KIT_COUNT - 1 ? at + 1 : KIT_COUNT);
        else if (n.down) setFocus(KIT_COUNT + Math.min(at, INV_COLS - 1));
        else if (n.up) setFocus(INV_BACK);
        return;
      }
      if (at < INV_BACK) {
        const i = at - KIT_COUNT;
        const r = Math.floor(i / INV_COLS);
        const c = i % INV_COLS;
        if (n.left) {
          if (c > 0) setFocus(at - 1);
        } else if (n.right) {
          if (c < INV_COLS - 1 && i + 1 < INV_SIZE) setFocus(at + 1);
        } else if (n.up) {
          if (r > 0) setFocus(KIT_COUNT + (r - 1) * INV_COLS + c);
          else setFocus(Math.min(KIT_COUNT - 1, c));
        } else if (n.down) {
          const ni = (r + 1) * INV_COLS + c;
          if (ni < INV_SIZE) setFocus(KIT_COUNT + ni);
          else setFocus(INV_BACK);
        }
        return;
      }
      if (n.up) setFocus(KIT_COUNT + INV_COLS * 2);
      else if (n.down) setFocus(0);
      else if (n.left) setFocus(KIT_COUNT);
      else if (n.right) setFocus(INV_BACK - 1);
      return;
    }
    if (n.back || n.menu) {
      if (carry) setHeld(null);
      else onBack();
      return;
    }
    if (!n.ok) return;
    if (at === closeIdx) {
      onBack();
      return;
    }
    if (crateMode) {
      if (at < CRATE_SIZE) pickOrPlace("crate", at);
      else pickOrPlace("inv", at - CRATE_SIZE);
      return;
    }
    if (at < KIT_COUNT) {
      const id = HAND_SLOTS[at]!.id;
      if (carry) dropOnEq(id, carry);
      else if (gameState.equipment[id]) {
        const empty = firstEmptyPocket();
        if (empty >= 0) dropOnInv(empty, { kind: "eq", id });
      }
      return;
    }
    const i = at - KIT_COUNT;
    const item = gameState.inventory[i];
    const kit = matchingKit(item);
    if (!carry && kit) {
      dropOnEq(kit, { kind: "inv", i });
      return;
    }
    pickOrPlace("inv", i);
  }, [nav]);
  useEffect(() => {
    const el = cardRef.current?.querySelector("[data-focus='1']");
    el?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  const carrying = heldLabel(held);
  const closeBtn = (extra = false) => (
    <button
      type="button"
      className="start-btn"
      data-focus={extra ? undefined : focus === closeIdx ? "1" : "0"}
      onClick={onBack}
    >
      {crateMode ? "Close" : "Back"}
    </button>
  );

  const packCard = (
    <div className="start-card options-card inv-card" ref={crateMode ? undefined : cardRef}>
      <p className="start-kicker">{gameState.playerName || "Player"}</p>
      <h2 className="options-title">Backpack</h2>
      <p className="start-copy">
        {crateMode
          ? "Your pack. Drag onto the chest, or drop the same item on itself to stack."
          : "Your pack. Drop the same item on another to stack. A equips pistol, shotgun, or axe."}
      </p>
      {!crateMode ? (
        <div className="inv-pane">
          <h3 className="inv-pane-title">Equipped</h3>
          <div className="hand-row">
            {HAND_SLOTS.map((row, i) => {
              const slot = gameState.equipment[row.id];
              return (
                <div
                  key={row.id}
                  className="kit-slot"
                  data-focus={focus === i ? "1" : "0"}
                  data-filled={slot ? "1" : "0"}
                  data-held={held?.kind === "eq" && held.id === row.id ? "1" : "0"}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    try {
                      dropOnEq(row.id, JSON.parse(e.dataTransfer.getData("text/plain")) as Held);
                    } catch {
                      /* ignore */
                    }
                  }}
                  draggable={Boolean(slot)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "eq", id: row.id }));
                  }}
                >
                  <span className="kit-slot-label">{row.label}</span>
                  <SlotFace slot={slot} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <PackGrid
        focusBase={crateMode ? CRATE_SIZE : KIT_COUNT}
        focus={focus}
        held={held}
        onDrop={dropOnInv}
      />
      <p className="pad-hint">
        {carrying ? `Holding ${carrying} · A place · B cancel` : "Pad: D-pad moves · A pick up / place · B close"}
      </p>
      <div className="options-actions">{closeBtn()}</div>
    </div>
  );

  const chestCard = (
    <div className="start-card options-card inv-card" ref={cardRef}>
      <p className="start-kicker">Home</p>
      <h2 className="options-title">Chest</h2>
      <p className="start-copy">Store items here. Drag to the backpack, or stack same items on each other.</p>
      <ChestGrid focus={focus} held={held} onDrop={dropOnCrate} />
      <p className="pad-hint">Close on either screen shuts both.</p>
      <div className="options-actions">{closeBtn(true)}</div>
    </div>
  );

  if (crateMode) {
    return (
      <div className="start-overlay options-overlay storage-overlay" onClick={(e) => { if (e.target === e.currentTarget) onBack(); }}>
        <div className="storage-pair">
          {chestCard}
          {packCard}
        </div>
      </div>
    );
  }

  return (
    <div className="start-overlay options-overlay" onClick={(e) => { if (e.target === e.currentTarget) onBack(); }}>
      {packCard}
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
  onQuit,
  onSave,
  onBuild,
  nav,
}: {
  onClose: () => void;
  onQuit?: () => void;
  onSave?: () => void;
  onBuild?: () => void;
  nav: MenuNav | null;
}) {
  const [pane, setPane] = useState<"root" | "controls" | "inventory" | "quit">("root");
  const [focus, setFocus] = useState(0);
  const [saved, setSaved] = useState("");
  const seen = useRef(0);
  const opened = useRef(performance.now());
  const focusRef = useRef(0);
  focusRef.current = focus;
  const items = onQuit ? 5 : 3;

  const saveNow = () => {
    onSave?.();
    setSaved("Saved");
    window.setTimeout(() => setSaved(""), 1400);
  };

  useEffect(() => {
    if (pane !== "root" && pane !== "quit") {
      if (nav?.seq) seen.current = nav.seq;
      return;
    }
    if (performance.now() - opened.current < 320) return;
    const n = takeNav(nav, seen);
    if (!n) return;
    if (pane === "quit") {
      if (n.left || n.right || n.up || n.down) setFocus((i) => (i === 0 ? 1 : 0));
      if (n.ok) {
        if (focusRef.current === 1) onQuit?.();
        else setPane("root");
      }
      if (n.back || n.menu) setPane("root");
      return;
    }
    if (n.down) setFocus((i) => (i + 1) % items);
    if (n.up) setFocus((i) => (i - 1 + items) % items);
    if (n.ok) {
      const at = focusRef.current;
      if (at === 0) setPane("inventory");
      else if (onQuit && at === 1) onBuild?.();
      else if (at === (onQuit ? 2 : 1)) setPane("controls");
      else if (onQuit && at === 3) saveNow();
      else if (onQuit && at === 4) {
        setFocus(0);
        setPane("quit");
      } else onClose();
    }
    if (n.back || n.menu) onClose();
  }, [nav, pane, items, onClose, onQuit, onBuild]);

  if (pane === "inventory") return <InventoryPanel nav={nav} onBack={() => setPane("root")} />;
  if (pane === "controls") return <ControlsHub nav={nav} onBack={() => setPane("root")} onClose={onClose} />;
  if (pane === "quit") {
    return (
      <div className="start-overlay options-overlay">
        <div className="start-card options-card">
          <p className="start-kicker">Paused</p>
          <h2 className="options-title">Quit</h2>
          <p className="start-copy">Are you sure you want to quit?</p>
          <div className="options-actions menu-stack">
            <button type="button" className="start-btn" data-focus={focus === 0 ? "1" : "0"} onClick={() => setPane("root")}>
              No
            </button>
            <button type="button" className="touch-btn" data-focus={focus === 1 ? "1" : "0"} onClick={() => onQuit?.()}>
              Yes, quit
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="start-overlay options-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="start-card options-card">
        <p className="start-kicker">Paused</p>
        <h2 className="options-title">Options</h2>
        <p className="start-copy">D-pad up/down · A select · B or Menu back{saved ? ` · ${saved}` : ""}</p>
        <div className="options-actions menu-stack">
          <button type="button" className="start-btn" data-focus={focus === 0 ? "1" : "0"} onClick={() => setPane("inventory")}>
            Inventory
          </button>
          {onQuit ? (
            <button type="button" className="touch-btn" data-focus={focus === 1 ? "1" : "0"} onClick={() => onBuild?.()}>
              Build mode
            </button>
          ) : null}
          <button type="button" className="touch-btn" data-focus={focus === (onQuit ? 2 : 1) ? "1" : "0"} onClick={() => setPane("controls")}>
            Controls
          </button>
          {onQuit ? (
            <>
              <button type="button" className="touch-btn" data-focus={focus === 3 ? "1" : "0"} onClick={saveNow}>
                Save
              </button>
              <button type="button" className="touch-btn" data-focus={focus === 4 ? "1" : "0"} onClick={() => { setFocus(0); setPane("quit"); }}>
                Quit
              </button>
            </>
          ) : (
            <button type="button" className="touch-btn" data-focus={focus === 2 ? "1" : "0"} onClick={onClose}>
              Resume
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PieceGlyph({ id }: { id: PieceId }) {
  if (id === "door") {
    return (
      <svg className="build-glyph" viewBox="0 0 48 32" aria-hidden="true">
        <path d="M8 30 V12 Q24 2 40 12 V30" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <rect x="20" y="16" width="8" height="14" fill="currentColor" opacity="0.7" />
      </svg>
    );
  }
  if (id === "floor") {
    return (
      <svg className="build-glyph" viewBox="0 0 48 32" aria-hidden="true">
        <rect x="6" y="10" width="36" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M6 17 H42 M18 10 V24 M30 10 V24" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      </svg>
    );
  }
  if (id === "corner") {
    return (
      <svg className="build-glyph" viewBox="0 0 48 32" aria-hidden="true">
        <path d="M10 8 V24 H38" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
      </svg>
    );
  }
  return (
    <svg className="build-glyph" viewBox="0 0 48 32" aria-hidden="true">
      <rect x="8" y="8" width="32" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M8 16 H40" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function BuildTray({ nav }: { nav: MenuNav | null }) {
  const seen = useRef(0);
  const [, setBump] = useState(0);
  const pending = gameState.buildPending;
  const focus = gameState.buildFocus;
  const selected = gameState.buildPiece;
  const deleting = gameState.buildTool === "delete";

  useEffect(() => {
    const n = takeNav(nav, seen);
    if (!n) return;
    if (pending >= 0) {
      if (n.up || n.left) gameState.buildConfirm = 0;
      if (n.down || n.right) gameState.buildConfirm = 1;
      if (n.ok) {
        if (gameState.buildConfirmLock) gameState.buildConfirmLock = false;
        else if (gameState.buildConfirm === 0) {
          if (deleteAt(pending)) saveCurrentInventory();
        } else cancelDelete();
      } else {
        gameState.buildConfirmLock = false;
      }
      if (n.back) cancelDelete();
      setBump((x) => x + 1);
      return;
    }
    if (n.ok) {
      if (focus === TRAY_DONE) setBuildMode(false);
      else if (focus === TRAY_DELETE) setTrayFocus(TRAY_DELETE);
      else setPiece(PIECES[focus]?.id ?? "wall");
    }
    if (n.back) setBuildMode(false);
  }, [nav, pending, focus]);

  if (pending >= 0) {
    const yes = gameState.buildConfirm === 0;
    return (
      <div className="start-overlay options-overlay" style={{ pointerEvents: "auto" }}>
        <div className="start-card options-card">
          <p className="start-kicker">Build</p>
          <h2 className="options-title">Delete</h2>
          <p className="start-copy">Are you sure you want to delete?</p>
          <div className="options-actions menu-stack">
            <button
              type="button"
              className="start-btn"
              data-focus={yes ? "1" : "0"}
              onClick={() => {
                if (deleteAt(pending)) saveCurrentInventory();
              }}
            >
              Yes
            </button>
            <button
              type="button"
              className="touch-btn"
              data-focus={yes ? "0" : "1"}
              onClick={() => cancelDelete()}
            >
              No
            </button>
          </div>
          <p className="pad-hint">D-pad select · A confirm · B back</p>
        </div>
      </div>
    );
  }

  return (
    <div className="build-tray">
      <div className="build-tray-pieces">
        {PIECES.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="build-piece"
            data-on={!deleting && selected === p.id ? "1" : "0"}
            data-focus={focus === i ? "1" : "0"}
            onClick={() => setPiece(p.id)}
          >
            <PieceGlyph id={p.id} />
            <span>{p.label}</span>
          </button>
        ))}
        <button
          type="button"
          className="build-piece"
          data-on={deleting ? "1" : "0"}
          data-focus={focus === TRAY_DELETE ? "1" : "0"}
          onClick={() => setTrayFocus(TRAY_DELETE)}
        >
          <svg className="build-glyph" viewBox="0 0 48 32" aria-hidden="true">
            <path d="M12 16 H36" stroke="currentColor" strokeWidth="2.6" />
            <rect x="16" y="8" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span>Delete</span>
        </button>
        <button
          type="button"
          className="build-done"
          data-focus={focus === TRAY_DONE ? "1" : "0"}
          onClick={() => setBuildMode(false)}
        >
          Done
        </button>
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
        <p className="start-copy">Make a shooter, then pick them to play.</p>
        {players.length === 0 ? (
          <p className="empty-note">No one yet. Make a player to start.</p>
        ) : (
          <ul className="player-list">
            {players.map((p, i) => (
              <li key={p.id} className="player-row">
                <button
                  type="button"
                  className="player-pick"
                  data-focus={focus === i * 2 ? "1" : "0"}
                  onClick={() => onPlay(p)}
                >
                  <span className="player-name">{p.name}</span>
                  <span className="player-look">{lookLabel(p.look)}</span>
                </button>
                <button
                  type="button"
                  className="player-x"
                  data-focus={focus === i * 2 + 1 ? "1" : "0"}
                  onClick={() => onDelete(p.id)}
                  aria-label={`Remove ${p.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="options-actions">
          <button type="button" className="start-btn" data-focus={focus === players.length * 2 ? "1" : "0"} onClick={onNew}>
            New player
          </button>
        </div>
        <p className="pad-hint">Xbox: D-pad move · right for Remove · A select · Menu options</p>
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
  const dropRef = useRef<(id: string) => void>(() => {});

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
            const nPlayers = list.length;
            const count = nPlayers * 2 + 1;
            if (n.down) {
              if (i >= nPlayers * 2) i = 0;
              else if (Math.floor(i / 2) + 1 < nPlayers) i = (Math.floor(i / 2) + 1) * 2 + (i % 2);
              else i = nPlayers * 2;
            }
            if (n.up) {
              if (i >= nPlayers * 2) i = nPlayers === 0 ? 0 : (nPlayers - 1) * 2;
              else if (i < 2) i = count - 1;
              else i -= 2;
            }
            if (n.right && i < nPlayers * 2 && i % 2 === 0) i += 1;
            if (n.left && i < nPlayers * 2 && i % 2 === 1) i -= 1;
            if (i !== focusRef.current) {
              focusRef.current = i;
              setFocus(i);
            }
            if (n.ok) {
              if (i >= nPlayers * 2) newRef.current();
              else if (i % 2 === 0) startRef.current(list[i / 2]!);
              else {
                const gone = list[Math.floor(i / 2)];
                if (gone) dropRef.current(gone.id);
              }
            }
          }
          setNav(n);
        } else {
          setNav(n);
        }
      } else {
        setNav(null);
      }
      setInputMuted(menuRef.current || !playingRef.current || gameState.crateOpen);
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
    setInputMuted(menu || !playing || gameState.crateOpen);
    if (menu || gameState.crateOpen) {
      cancelRebind();
      document.exitPointerLock?.();
    }
  }, [menu, playing, gameState.crateOpen]);

  const persist = () => {
    const list = saveCurrentInventory();
    setPlayers(list);
  };

  const start = (profile: PlayerProfile) => {
    unlockAudio();
    const fresh = loadPlayers().find((p) => p.id === profile.id) ?? profile;
    const inv = migrateInventory(fresh.inventory);
    const eq = migrateEquipment(fresh.equipment);
    const crate = migrateCrate(fresh.crate);
    ensureStarterGear(inv, eq);
    gameState.look = fresh.look;
    gameState.playerName = fresh.name;
    gameState.playerId = fresh.id;
    gameState.loadout = emptyLoadout();
    gameState.inventory = inv;
    gameState.equipment = eq;
    gameState.crate = crate;
    gameState.crateOpen = false;
    gameState.buildings = migrateBuildings(fresh.buildings);
    setBuildMode(false);
    gameState.hands = syncHands(eq, "none");
    gameState.setup = false;
    setPlayers(loadPlayers());
    setPlaying(true);
    gameState.playing = true;
    setMenu(false);
    lockPointer(hostRef.current);
  };
  startRef.current = start;
  newRef.current = () => {
    gameState.setup = false;
    setScreen("create");
    setFocus(0);
    focusRef.current = 0;
  };

  const makePlayer = (name: string, look: LookId) => {
    const inv = starterInventory();
    const next = [
      ...players,
      {
        id: makeId(),
        name,
        look,
        loadout: emptyLoadout(),
        inventory: inv,
        equipment: emptyEquipment(),
        crate: emptyCrate(),
        buildings: [],
        created: Date.now(),
      },
    ];
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
    const max = next.length * 2;
    if (focusRef.current > max) {
      focusRef.current = Math.max(0, max);
      setFocus(focusRef.current);
    }
  };
  dropRef.current = dropPlayer;

  const toRoster = () => {
    setPlayers(loadPlayers());
    setPlaying(false);
    gameState.playing = false;
    gameState.setup = false;
    gameState.crateOpen = false;
    setBuildMode(false);
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
      {playing && gameState.crateOpen && !menu && (
        <InventoryPanel
          mode="crate"
          nav={nav}
          onBack={() => {
            gameState.crateOpen = false;
            persist();
            if (playing) lockPointer(hostRef.current);
          }}
        />
      )}
      {menu && (
        <OptionsPanel
          onClose={playing ? closeMenu : () => setMenu(false)}
          onQuit={playing ? toRoster : undefined}
          onSave={playing ? persist : undefined}
          onBuild={
            playing
              ? () => {
                  setBuildMode(true);
                  closeMenu();
                }
              : undefined
          }
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
              <span className="hud-label">{gameState.hands === "none" ? "Hands" : gameState.hands === "tool" ? "Tool" : "Gun"}</span>
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
          {gameState.buildMode ? <BuildTray nav={nav} /> : null}
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
              {gameState.hands === "none" || gameState.hands === "tool" ? (
                <span className="hud-ammo-mag">—</span>
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
