export type LookId = "mannequin" | "female" | "hero-male" | "hero-female";

export type PlayerProfile = {
  id: string;
  name: string;
  look: LookId;
  created: number;
};

export const LOOKS: { id: LookId; label: string; file: string; tag: string; paint: boolean }[] = [
  { id: "mannequin", label: "Male", file: "/models/character.glb", tag: "Mannequin", paint: true },
  { id: "female", label: "Female", file: "/models/character_f.glb", tag: "Mannequin", paint: true },
  { id: "hero-male", label: "Male", file: "/models/characters/Superhero_Male_FullBody.gltf", tag: "Character", paint: false },
  { id: "hero-female", label: "Female", file: "/models/characters/Superhero_Female_FullBody.gltf", tag: "Character", paint: false },
];

const LOOK_IDS = new Set<string>(LOOKS.map((l) => l.id));

export function migrateLook(id: string | undefined): LookId {
  if (id && LOOK_IDS.has(id)) return id as LookId;
  if (id === "female-peasant" || id === "female-ranger") return "hero-female";
  if (id === "male-peasant" || id === "male-ranger") return "hero-male";
  return "mannequin";
}

export function lookFile(id: LookId) {
  return LOOKS.find((l) => l.id === id)?.file ?? LOOKS[0].file;
}

export function lookDef(id: LookId | string) {
  const look = migrateLook(id);
  return LOOKS.find((l) => l.id === look) ?? LOOKS[0];
}

export function lookLabel(id: LookId | string) {
  const row = lookDef(id);
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
