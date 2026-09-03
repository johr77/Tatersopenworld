/** Standard Gamepad poll. Call every frame. Do not cache the Gamepad object. */

export function radialDeadzone(x: number, y: number, dz = 0.18) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export type PadFrame = {
  connected: boolean;
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  sprint: boolean;
  fire: boolean;
  edge: (i: number) => boolean;
  pressed: (i: number) => boolean;
};

export function readPad(prev: boolean[]): { frame: PadFrame; nextPrev: boolean[] } {
  let list: (Gamepad | null)[] = [];
  try {
    list = Array.from(navigator.getGamepads());
  } catch {
    return {
      frame: {
        connected: false,
        moveX: 0,
        moveY: 0,
        lookX: 0,
        lookY: 0,
        sprint: false,
        fire: false,
        edge: () => false,
        pressed: () => false,
      },
      nextPrev: [],
    };
  }
  const gp = list.find((g) => g && g.mapping === "standard") ?? list.find((g) => g);
  if (!gp) {
    return {
      frame: {
        connected: false,
        moveX: 0,
        moveY: 0,
        lookX: 0,
        lookY: 0,
        sprint: false,
        fire: false,
        edge: () => false,
        pressed: () => false,
      },
      nextPrev: [],
    };
  }
  const pressed = (i: number) => !!gp.buttons[i]?.pressed;
  const val = (i: number) => gp.buttons[i]?.value ?? 0;
  const edge = (i: number) => pressed(i) && !prev[i];
  const ls = radialDeadzone(gp.axes[0] || 0, gp.axes[1] || 0);
  const rs = radialDeadzone(gp.axes[2] || 0, gp.axes[3] || 0, 0.12);
  return {
    frame: {
      connected: true,
      moveX: ls.x,
      moveY: -ls.y,
      lookX: rs.x,
      lookY: rs.y,
      sprint: val(6) > 0.4 || pressed(10),
      fire: val(7) > 0.42,
      edge,
      pressed,
    },
    nextPrev: gp.buttons.map((btn) => btn.pressed),
  };
}
