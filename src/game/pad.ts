/** Standard Gamepad poll. Call every frame. Do not cache the Gamepad object. */

import { DEFAULT_PAD_BINDS, type PadAction, type PadBindings } from "./types";

const PAD_KEY = "tater-pad-binds";

export function radialDeadzone(x: number, y: number, dz = 0.18) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export const PAD_BTN_LABEL: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "View",
  9: "Menu",
  10: "LS click",
  11: "RS click",
  12: "D-up",
  13: "D-down",
  14: "D-left",
  15: "D-right",
};

export function padBtnName(i: number) {
  return PAD_BTN_LABEL[i] ?? `Btn ${i}`;
}

export const PAD_BIND_LABELS: Record<PadAction, string> = {
  confirm: "Confirm / select",
  back: "Back",
  jump: "Jump",
  fire: "Use / chop / place",
  sprint: "Sprint",
  menu: "Radial menu",
  cam: "Camera",
  pause: "Pause",
  cyclePrev: "Cycle previous",
  cycleNext: "Cycle next",
};

let cachedPad: PadBindings | null = null;

export function loadPadBinds(): PadBindings {
  if (cachedPad) return cachedPad;
  try {
    const raw = localStorage.getItem(PAD_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PadBindings>;
      cachedPad = { ...DEFAULT_PAD_BINDS, ...p };
      return cachedPad;
    }
  } catch {
    /* ignore */
  }
  cachedPad = { ...DEFAULT_PAD_BINDS };
  return cachedPad;
}

export function savePadBinds(b: PadBindings) {
  cachedPad = { ...b };
  localStorage.setItem(PAD_KEY, JSON.stringify(b));
}

export function getPadBinds(): PadBindings {
  return loadPadBinds();
}

export type PadFrame = {
  connected: boolean;
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  edge: (i: number) => boolean;
  pressed: (i: number) => boolean;
  held: (i: number) => boolean;
};

export function readPad(prev: boolean[]): { frame: PadFrame; nextPrev: boolean[] } {
  const empty = (): PadFrame => ({
    connected: false,
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    edge: () => false,
    pressed: () => false,
    held: () => false,
  });
  let list: (Gamepad | null)[] = [];
  try {
    list = Array.from(navigator.getGamepads());
  } catch {
    return { frame: empty(), nextPrev: [] };
  }
  const gp = list.find((g) => g && g.mapping === "standard") ?? list.find((g) => g);
  if (!gp) return { frame: empty(), nextPrev: [] };
  const pressed = (i: number) => !!gp.buttons[i]?.pressed;
  const val = (i: number) => gp.buttons[i]?.value ?? 0;
  const held = (i: number) => (i === 6 || i === 7 ? val(i) > 0.42 : pressed(i));
  const edge = (i: number) => held(i) && !prev[i];
  const ls = radialDeadzone(gp.axes[0] || 0, gp.axes[1] || 0);
  const rs = radialDeadzone(gp.axes[2] || 0, gp.axes[3] || 0, 0.12);
  return {
    frame: {
      connected: true,
      moveX: ls.x,
      moveY: -ls.y,
      lookX: rs.x,
      lookY: rs.y,
      edge,
      pressed,
      held,
    },
    nextPrev: gp.buttons.map((btn) => btn.pressed || btn.value > 0.42),
  };
}
