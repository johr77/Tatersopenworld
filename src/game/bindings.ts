import { DEFAULT_BINDS, type BindAction, type Bindings } from "./types";

const KEY = "tater-binds";

export function loadBinds(): Bindings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_BINDS };
    const p = JSON.parse(raw) as Partial<Bindings>;
    return { ...DEFAULT_BINDS, ...p };
  } catch {
    return { ...DEFAULT_BINDS };
  }
}

export function saveBinds(b: Bindings) {
  localStorage.setItem(KEY, JSON.stringify(b));
}

export const BIND_LABELS: Record<BindAction, string> = {
  forward: "Move forward",
  back: "Move back",
  left: "Strafe left",
  right: "Strafe right",
  jump: "Jump",
  sprint: "Sprint",
  menu: "Radial menu",
  cam: "Camera",
};
