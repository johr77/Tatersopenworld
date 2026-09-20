export type ItemId = "wood" | "strand" | "stone" | "pistol" | "shotgun" | "axe";

export type InvSlot = { id: ItemId; count: number } | null;

export type EquipSlotId = "weapon" | "weapon2" | "tool" | "head" | "body" | "arms" | "legs" | "feet" | "extra";

export type Equipment = Record<EquipSlotId, InvSlot>;

export type Hands = "weapon" | "weapon2" | "none";

export const INV_SIZE = 12;
export const CRATE_SIZE = 12;
export const INV_COLS = 4;
export const WOOD_PER_TREE = 10;

export const ITEM_LABEL: Record<ItemId, string> = {
  wood: "Wood",
  strand: "Strand",
  stone: "Stone",
  pistol: "Pistol",
  shotgun: "Shotgun",
  axe: "Axe",
};

/** Drop replacements in public/icons using these names (png or svg). */
export const ITEM_ICON: Record<ItemId, string> = {
  wood: "/icons/wood.svg",
  strand: "/icons/strand.svg",
  stone: "/icons/stone.svg",
  pistol: "/icons/pistol.svg",
  shotgun: "/icons/shotgun.svg",
  axe: "/icons/axe.svg",
};

export const EQUIP_SLOTS: { id: EquipSlotId; label: string }[] = [
  { id: "weapon", label: "Weapon 1" },
  { id: "weapon2", label: "Weapon 2" },
  { id: "tool", label: "Tool" },
  { id: "head", label: "Head" },
  { id: "body", label: "Body" },
  { id: "arms", label: "Arms" },
  { id: "legs", label: "Legs" },
  { id: "feet", label: "Feet" },
  { id: "extra", label: "Extra" },
];

export const HAND_SLOTS = EQUIP_SLOTS.filter(
  (s): s is { id: "weapon" | "weapon2" | "tool"; label: string } =>
    s.id === "weapon" || s.id === "weapon2" || s.id === "tool",
);

export const EQUIP_ACCEPT: Record<EquipSlotId, ItemId[]> = {
  weapon: ["pistol"],
  weapon2: ["shotgun"],
  tool: ["axe"],
  head: [],
  body: [],
  arms: [],
  legs: [],
  feet: [],
  extra: [],
};

const UNIQUE: ItemId[] = ["pistol", "shotgun", "axe"];
const KNOWN: ItemId[] = ["wood", "strand", "stone", "pistol", "shotgun", "axe"];

export function emptyInventory(): InvSlot[] {
  return Array.from({ length: INV_SIZE }, () => null);
}

export function emptyEquipment(): Equipment {
  return {
    weapon: null,
    weapon2: null,
    tool: null,
    head: null,
    body: null,
    arms: null,
    legs: null,
    feet: null,
    extra: null,
  };
}

export function emptyCrate(): InvSlot[] {
  return Array.from({ length: CRATE_SIZE }, () => null);
}

export function starterInventory(): InvSlot[] {
  const inv = emptyInventory();
  inv[0] = { id: "pistol", count: 1 };
  inv[1] = { id: "axe", count: 1 };
  inv[2] = { id: "shotgun", count: 1 };
  return inv;
}

function cloneSlot(s: InvSlot): InvSlot {
  return s ? { id: s.id, count: s.count } : null;
}

export function migrateInventory(raw: InvSlot[] | undefined): InvSlot[] {
  const inv = emptyInventory();
  if (!Array.isArray(raw)) return inv;
  for (let i = 0; i < INV_SIZE; i++) {
    const s = raw[i];
    if (s && KNOWN.includes(s.id) && s.count > 0) inv[i] = { id: s.id, count: s.count };
  }
  return inv;
}

export function migrateEquipment(raw: Partial<Equipment> | undefined): Equipment {
  const eq = emptyEquipment();
  if (!raw || typeof raw !== "object") return eq;
  for (const slot of EQUIP_SLOTS) {
    const s = raw[slot.id];
    if (s && KNOWN.includes(s.id) && s.count > 0 && EQUIP_ACCEPT[slot.id].includes(s.id)) {
      eq[slot.id] = { id: s.id, count: s.count };
    }
  }
  return eq;
}

export function migrateCrate(raw: InvSlot[] | undefined): InvSlot[] {
  const crate = emptyCrate();
  if (!Array.isArray(raw)) return crate;
  for (let i = 0; i < CRATE_SIZE; i++) {
    const s = raw[i];
    if (s && KNOWN.includes(s.id) && s.count > 0) crate[i] = { id: s.id, count: s.count };
  }
  return crate;
}

export function hasItem(inv: InvSlot[], eq: Equipment, id: ItemId) {
  if (inv.some((s) => s?.id === id)) return true;
  return EQUIP_SLOTS.some((slot) => eq[slot.id]?.id === id);
}

export function ensureStarterGear(inv: InvSlot[], eq: Equipment) {
  if (!hasItem(inv, eq, "pistol")) addItem(inv, "pistol", 1);
  if (!hasItem(inv, eq, "axe")) addItem(inv, "axe", 1);
  if (!hasItem(inv, eq, "shotgun")) addItem(inv, "shotgun", 1);
}

export function addItem(inv: InvSlot[], id: ItemId, count: number) {
  if (UNIQUE.includes(id)) {
    if (inv.some((s) => s?.id === id)) return true;
    const empty = inv.findIndex((s) => !s);
    if (empty < 0) return false;
    inv[empty] = { id, count: 1 };
    return true;
  }
  const stack = inv.find((s) => s && s.id === id);
  if (stack) {
    stack.count += count;
    return true;
  }
  const empty = inv.findIndex((s) => !s);
  if (empty < 0) return false;
  inv[empty] = { id, count };
  return true;
}

export function collectWood(inv: InvSlot[], count = WOOD_PER_TREE) {
  return addItem(inv, "wood", count);
}

export function collectStrand(inv: InvSlot[], count = 1) {
  return addItem(inv, "strand", count);
}

export function collectStone(inv: InvSlot[], count = 1) {
  return addItem(inv, "stone", count);
}

export function isStackable(id: ItemId) {
  return !UNIQUE.includes(id);
}

export function canFit(slot: EquipSlotId, item: InvSlot) {
  return Boolean(item && EQUIP_ACCEPT[slot].includes(item.id));
}

export function moveInvToEquip(inv: InvSlot[], eq: Equipment, from: number, slot: EquipSlotId) {
  const item = inv[from];
  if (!canFit(slot, item)) return false;
  const prev = eq[slot];
  eq[slot] = cloneSlot(item);
  inv[from] = cloneSlot(prev);
  return true;
}

export function moveEquipToInv(inv: InvSlot[], eq: Equipment, slot: EquipSlotId, to: number) {
  const item = eq[slot];
  if (!item) return false;
  const dest = inv[to];
  if (!dest) {
    inv[to] = cloneSlot(item);
    eq[slot] = null;
    return true;
  }
  if (canFit(slot, dest)) {
    eq[slot] = cloneSlot(dest);
    inv[to] = cloneSlot(item);
    return true;
  }
  return false;
}

export function mergeOrMove(a: InvSlot[], ai: number, b: InvSlot[], bi: number) {
  if (a === b && ai === bi) return true;
  const from = a[ai];
  const to = b[bi];
  if (!from) return false;
  if (to && from.id === to.id && isStackable(from.id)) {
    to.count += from.count;
    a[ai] = null;
    return true;
  }
  a[ai] = cloneSlot(to);
  b[bi] = cloneSlot(from);
  return true;
}

export function moveInvToInv(inv: InvSlot[], from: number, to: number) {
  return mergeOrMove(inv, from, inv, to);
}

export function moveBetween(a: InvSlot[], ai: number, b: InvSlot[], bi: number) {
  return mergeOrMove(a, ai, b, bi);
}

export function syncHands(eq: Equipment, hands: Hands): Hands {
  if (hands === "weapon" && eq.weapon) return "weapon";
  if (hands === "weapon2" && eq.weapon2) return "weapon2";
  if (eq.weapon) return "weapon";
  if (eq.weapon2) return "weapon2";
  return "none";
}
