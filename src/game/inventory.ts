import type { Inventory, SavedPiece, ToolId } from "./types";

function invKey(id: string) {
  return `tater-inv-${id}`;
}
function buildKey(id: string) {
  return `tater-build-${id}`;
}

export function loadInv(id: string): Inventory {
  try {
    const raw = localStorage.getItem(invKey(id));
    if (raw) {
      const p = JSON.parse(raw) as Inventory;
      return { wood: Number(p.wood) || 0, tool: p.tool === "gun" ? "gun" : "axe" };
    }
  } catch {
    /* ignore */
  }
  return { wood: 0, tool: "axe" };
}

export function saveInv(id: string, inv: Inventory) {
  localStorage.setItem(invKey(id), JSON.stringify(inv));
}

export function loadBuild(id: string): SavedPiece[] {
  try {
    const raw = localStorage.getItem(buildKey(id));
    if (!raw) return [];
    const p = JSON.parse(raw) as SavedPiece[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function saveBuild(id: string, pieces: SavedPiece[]) {
  localStorage.setItem(buildKey(id), JSON.stringify(pieces));
}

export function setTool(id: string, tool: ToolId) {
  const inv = loadInv(id);
  inv.tool = tool;
  saveInv(id, inv);
}
