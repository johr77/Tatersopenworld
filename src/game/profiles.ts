export type LookId = "mannequin" | "female";

export type PlayerProfile = {
  id: string;
  name: string;
  look: LookId;
  created: number;
};

export const LOOKS: { id: LookId; label: string; file: string; tag: string }[] = [
  { id: "mannequin", label: "Male", file: "/models/character.glb", tag: "Mannequin" },
  { id: "female", label: "Female", file: "/models/character_f.glb", tag: "Mannequin" },
];

export function migrateLook(id: string | undefined): LookId {
  if (id === "female" || id === "female-peasant" || id === "female-ranger") return "female";
  return "mannequin";
}

export function lookFile(id: LookId) {
  return LOOKS.find((l) => l.id === id)?.file ?? LOOKS[0].file;
}

export function lookLabel(id: LookId | string) {
  const look = migrateLook(id);
  const row = LOOKS.find((l) => l.id === look);
  if (!row) return "Mannequin";
  return `${row.tag} · ${row.label}`;
}

const STORAGE = "taters.players.v1";

export function loadPlayers(): PlayerProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return [];
    const data = JSON.parse(raw) as PlayerProfile[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((p) => p && typeof p.name === "string")
      .map((p) => ({ ...p, look: migrateLook(p.look) }));
  } catch {
    return [];
  }
}

export function savePlayers(list: PlayerProfile[]) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function makeId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
