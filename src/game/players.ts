import type { PlayerRecord } from "./types";

const KEY = "tater-players";

function read(): PlayerRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlayerRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: PlayerRecord[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function listPlayers(): PlayerRecord[] {
  return read();
}

export function createPlayer(name: string, charId: string): PlayerRecord {
  const rec: PlayerRecord = {
    id: crypto.randomUUID(),
    name: name.trim() || "Tater",
    charId,
    createdAt: Date.now(),
  };
  write([rec, ...read()]);
  return rec;
}

export function deletePlayer(id: string) {
  write(read().filter((p) => p.id !== id));
  try {
    localStorage.removeItem(`tater-inv-${id}`);
    localStorage.removeItem(`tater-build-${id}`);
  } catch {
    /* ignore */
  }
}

export function getPlayer(id: string): PlayerRecord | undefined {
  return read().find((p) => p.id === id);
}
