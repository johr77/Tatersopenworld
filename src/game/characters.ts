export type CharDef = {
  id: string;
  label: string;
  body: "male" | "female";
  /** One or more UBC hair glTF stems in /env/hair (e.g. Hair_Buzzed). Bram stacks buzzed + beard. */
  hairs: string[];
};

export const CHARACTERS: CharDef[] = [
  { id: "ash", label: "Ash", body: "male", hairs: ["Hair_Buzzed"] },
  { id: "rowan", label: "Rowan", body: "male", hairs: ["Hair_SimpleParted"] },
  { id: "bram", label: "Bram", body: "male", hairs: ["Hair_Buzzed", "Hair_Beard"] },
  { id: "wynn", label: "Wynn", body: "male", hairs: ["Hair_Long"] },
  { id: "fern", label: "Fern", body: "female", hairs: ["Hair_Buns"] },
  { id: "pia", label: "Pia", body: "female", hairs: ["Hair_BuzzedFemale"] },
  { id: "lumen", label: "Lumen", body: "female", hairs: ["Hair_Long"] },
  { id: "sage", label: "Sage", body: "female", hairs: ["Hair_SimpleParted"] },
];

export function charById(id: string): CharDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]!;
}

export function hairLabel(c: CharDef): string {
  return c.hairs.map((h) => h.replace(/^Hair_/, "")).join(" + ");
}
