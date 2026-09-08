export type LookId = "mannequin" | "male-peasant" | "male-ranger" | "female-peasant" | "female-ranger";

export type PlayerProfile = {
  id: string;
  name: string;
  look: LookId;
  created: number;
};

export const LOOKS: { id: LookId; label: string; file: string; tag: string }[] = [
  { id: "mannequin", label: "Mannequin", file: "/models/character.glb", tag: "Base" },
  { id: "male-ranger", label: "Ranger", file: "/models/outfits/Male_Ranger.gltf", tag: "Man" },
  { id: "male-peasant", label: "Peasant", file: "/models/outfits/Male_Peasant.gltf", tag: "Man" },
  { id: "female-ranger", label: "Ranger", file: "/models/outfits/Female_Ranger.gltf", tag: "Woman" },
  { id: "female-peasant", label: "Peasant", file: "/models/outfits/Female_Peasant.gltf", tag: "Woman" },
];

export function lookFile(id: LookId) {
  return LOOKS.find((l) => l.id === id)?.file ?? LOOKS[0].file;
}

export function lookLabel(id: LookId) {
  const row = LOOKS.find((l) => l.id === id);
  if (!row) return id;
  if (id === "mannequin") return "Mannequin";
  return `${row.tag} ${row.label}`;
}

const STORAGE = "taters.players.v1";

export function loadPlayers(): PlayerProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return [];
    const data = JSON.parse(raw) as PlayerProfile[];
    if (!Array.isArray(data)) return [];
    return data.filter((p) => p && typeof p.name === "string" && p.look);
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
