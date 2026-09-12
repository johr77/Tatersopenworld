export type ItemId = "wood";

export type InvSlot = { id: ItemId; count: number } | null;

export const INV_SIZE = 6;
export const WOOD_PER_TREE = 10;

export const ITEM_LABEL: Record<ItemId, string> = {
  wood: "Wood",
};

export function emptyInventory(): InvSlot[] {
  return Array.from({ length: INV_SIZE }, () => null);
}

export function migrateInventory(raw: InvSlot[] | undefined): InvSlot[] {
  const inv = emptyInventory();
  if (!Array.isArray(raw)) return inv;
  for (let i = 0; i < INV_SIZE; i++) {
    const s = raw[i];
    if (s && s.id === "wood" && s.count > 0) inv[i] = { id: s.id, count: s.count };
  }
  return inv;
}

export function addItem(inv: InvSlot[], id: ItemId, count: number) {
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
