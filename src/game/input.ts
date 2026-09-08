import { gameState } from "./state";

/** Device state → abstract actions. Gameplay reads only `sampleActions`. */

export type ActionId =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "jump"
  | "crouch"
  | "sprint"
  | "fire"
  | "aim"
  | "reload"
  | "toggleView"
  | "freeLook"
  | "alignCam"
  | "menu"
  | "nextWeapon"
  | "prevWeapon";

export type Binding = { keys: string[]; buttons: number[] };

export const ACTION_LABELS: Record<ActionId, string> = {
  forward: "Forward",
  back: "Back",
  left: "Left",
  right: "Right",
  jump: "Jump",
  crouch: "Crouch",
  sprint: "Sprint",
  fire: "Fire",
  aim: "Aim",
  reload: "Reload",
  toggleView: "Toggle view",
  freeLook: "Free look",
  alignCam: "Align camera",
  menu: "Options",
  nextWeapon: "Next weapon",
  prevWeapon: "Prev weapon",
};

export const PAD_BUTTON_NAMES = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "View",
  "Menu",
  "LS",
  "RS",
  "D-Up",
  "D-Down",
  "D-Left",
  "D-Right",
];

export const DEFAULT_BINDINGS: Record<ActionId, Binding> = {
  forward: { keys: ["KeyW", "ArrowUp"], buttons: [] },
  back: { keys: ["KeyS", "ArrowDown"], buttons: [] },
  left: { keys: ["KeyA", "ArrowLeft"], buttons: [] },
  right: { keys: ["KeyD", "ArrowRight"], buttons: [] },
  jump: { keys: ["Space"], buttons: [0] },
  crouch: { keys: ["ControlLeft", "ControlRight", "KeyC"], buttons: [1] },
  sprint: { keys: ["ShiftLeft", "ShiftRight"], buttons: [10, 5] },
  fire: { keys: [], buttons: [7] },
  aim: { keys: [], buttons: [6] },
  reload: { keys: ["KeyR"], buttons: [2] },
  toggleView: { keys: ["KeyV"], buttons: [3] },
  freeLook: { keys: ["AltLeft", "AltRight", "KeyQ"], buttons: [] },
  alignCam: { keys: ["KeyZ"], buttons: [11] },
  menu: { keys: ["Tab"], buttons: [9] },
  nextWeapon: { keys: ["BracketRight", "Period"], buttons: [15, 12, 4] },
  prevWeapon: { keys: ["BracketLeft", "Comma"], buttons: [14, 13] },
};

const STORAGE = "taters.binds.v3";

export const settings = {
  bindings: structuredClone(DEFAULT_BINDINGS) as Record<ActionId, Binding>,
  mouseSens: 1,
  stickSens: 1,
  invertY: false,
  deadzone: 0.16,
  snapBack: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return;
    const data = JSON.parse(raw) as Partial<typeof settings>;
    if (data.bindings) {
      for (const id of Object.keys(DEFAULT_BINDINGS) as ActionId[]) {
        const b = data.bindings[id];
        if (b?.keys && b?.buttons) settings.bindings[id] = { keys: b.keys, buttons: b.buttons };
      }
    }
    if (typeof data.mouseSens === "number") settings.mouseSens = data.mouseSens;
    if (typeof data.stickSens === "number") settings.stickSens = data.stickSens;
    if (typeof data.invertY === "boolean") settings.invertY = data.invertY;
    if (typeof data.deadzone === "number") settings.deadzone = data.deadzone;
    if (typeof data.snapBack === "boolean") settings.snapBack = data.snapBack;
  } catch {
    /* keep defaults */
  }
}

export function saveSettings() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function resetBindings() {
  settings.bindings = structuredClone(DEFAULT_BINDINGS);
  settings.mouseSens = 1;
  settings.stickSens = 1;
  settings.invertY = false;
  settings.deadzone = 0.16;
  settings.snapBack = true;
  saveSettings();
}

export function prettyKey(code: string) {
  return code
    .replace(/^Key/, "")
    .replace(/^Arrow/, "")
    .replace(/^Digit/, "")
    .replace("ControlLeft", "Ctrl")
    .replace("ControlRight", "Ctrl")
    .replace("ShiftLeft", "Shift")
    .replace("ShiftRight", "Shift")
    .replace("Escape", "Esc")
    .replace("Space", "Space")
    .replace("AltLeft", "Alt")
    .replace("AltRight", "Alt");
}

export function prettyBinding(id: ActionId) {
  const b = settings.bindings[id];
  const keys = b.keys.map(prettyKey);
  const pads = b.buttons.map((n) => PAD_BUTTON_NAMES[n] ?? `Btn ${n}`);
  const extra =
    id === "fire"
      ? ["LMB"]
      : id === "aim"
        ? ["RMB"]
        : id === "nextWeapon"
          ? ["Wheel down"]
          : id === "prevWeapon"
            ? ["Wheel up"]
            : [];
  return [...keys, ...extra, ...pads].filter(Boolean).join(" · ") || "Unbound";
}

const keys = new Set<string>();
let forced: Set<string> | null = null;
let muted = false;
let rebindTo: ActionId | null = null;
let onRebind: ((label: string) => void) | null = null;
let wheelDir = 0;

export const mouse = {
  dx: 0,
  dy: 0,
  locked: false,
  lookX: 0,
  lookY: 0,
  fireHeld: false,
  aimHeld: false,
};

export const touchMove = { x: 0, y: 0 };
export const touchLook = { x: 0, y: 0 };

export const padState = {
  connected: false,
  id: "",
  stickX: 0,
  stickY: 0,
};

export function setInputMuted(v: boolean) {
  muted = v;
}

export function isRebinding() {
  return rebindTo !== null;
}

export function beginRebind(id: ActionId, cb?: (label: string) => void) {
  rebindTo = id;
  onRebind = cb ?? null;
}

export function cancelRebind() {
  rebindTo = null;
  onRebind = null;
}

function applyRebind(kind: "key" | "button", value: string | number) {
  if (!rebindTo) return;
  const b = settings.bindings[rebindTo];
  if (kind === "key") {
    const code = value as string;
    for (const id of Object.keys(settings.bindings) as ActionId[]) {
      settings.bindings[id].keys = settings.bindings[id].keys.filter((k) => k !== code);
    }
    b.keys = [code];
  } else {
    const btn = value as number;
    for (const id of Object.keys(settings.bindings) as ActionId[]) {
      settings.bindings[id].buttons = settings.bindings[id].buttons.filter((n) => n !== btn);
    }
    b.buttons = [btn];
  }
  saveSettings();
  const label = prettyBinding(rebindTo);
  rebindTo = null;
  onRebind?.(label);
  onRebind = null;
}

let inited = false;

export function initInput() {
  if (inited) return;
  inited = true;
  loadSettings();

  const onDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const typing =
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (typing) return;
    if (rebindTo) {
      e.preventDefault();
      if (e.code === "Escape") {
        cancelRebind();
        return;
      }
      applyRebind("key", e.code);
      return;
    }
    keys.add(e.code);
    if (isBoundKey(e.code)) e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const clear = () => {
    keys.clear();
    mouse.fireHeld = false;
    mouse.aimHeld = false;
  };
  const dropLock = () => {
    mouse.locked = false;
    gameState.locked = false;
    mouse.fireHeld = false;
    mouse.aimHeld = false;
  };

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", () => {
    clear();
    dropLock();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clear();
      dropLock();
    }
  });
  window.addEventListener("focus", () => {
    if (!document.pointerLockElement) dropLock();
  });

  window.addEventListener("mousemove", (e) => {
    if (!document.pointerLockElement) {
      if (mouse.locked) {
        mouse.locked = false;
        gameState.locked = false;
      }
      return;
    }
    mouse.locked = true;
    gameState.locked = true;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });

  window.addEventListener("mousedown", (e) => {
    if (rebindTo) return;
    if (!mouse.locked) return;
    if (e.button === 0) mouse.fireHeld = true;
    if (e.button === 2) mouse.aimHeld = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) mouse.fireHeld = false;
    if (e.button === 2) mouse.aimHeld = false;
  });
  window.addEventListener("contextmenu", (e) => {
    if (mouse.locked || gameState.playing) e.preventDefault();
  });
  window.addEventListener(
    "wheel",
    (e) => {
      if (!gameState.playing || (muted && !forced) || rebindTo) return;
      if (!mouse.locked && !padState.connected) return;
      e.preventDefault();
      wheelDir += e.deltaY > 0 ? 1 : -1;
    },
    { passive: false },
  );

  window.addEventListener("gamepadconnected", () => refreshPadMeta());
  window.addEventListener("gamepaddisconnected", () => refreshPadMeta());
  refreshPadMeta();
}

function isBoundKey(code: string) {
  for (const b of Object.values(settings.bindings)) {
    if (b.keys.includes(code)) return true;
  }
  return false;
}

function refreshPadMeta() {
  const pad = firstPad();
  padState.connected = Boolean(pad);
  padState.id = pad?.id ?? "";
}

function firstPad(): Gamepad | null {
  const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : [];
  if (!pads) return null;
  for (const pad of pads) {
    if (!pad) continue;
    if (pad.mapping === "standard" || pad.axes.length >= 4) return pad;
  }
  return null;
}

export function setForcedKeys(codes: string[] | null) {
  forced = codes ? new Set(codes) : null;
}

export function isDown(code: string) {
  if (forced) return forced.has(code);
  return keys.has(code);
}

function actionDown(id: ActionId, pad: Gamepad | null) {
  const b = settings.bindings[id] ?? DEFAULT_BINDINGS[id];
  if (!b) return false;
  for (const code of b.keys) {
    if (isDown(code)) return true;
  }
  if (!pad) return false;
  for (const i of b.buttons) {
    const btn = pad.buttons[i];
    if (!btn) continue;
    if (btn.pressed || btn.value > 0.5) return true;
  }
  return false;
}

function radial(x: number, y: number, dz: number) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export type Actions = {
  moveX: number;
  moveY: number;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  fire: boolean;
  aim: boolean;
  reload: boolean;
  toggleView: boolean;
  freeLook: boolean;
  alignCam: boolean;
  menu: boolean;
  weaponSlot: number | null;
  nextWeapon: boolean;
  prevWeapon: boolean;
  lookStickX: number;
  lookStickY: number;
  padActive: boolean;
};

const prev = {
  jump: false,
  fire: false,
  reload: false,
  toggleView: false,
  alignCam: false,
  menu: false,
  nextWeapon: false,
  prevWeapon: false,
};

export const edges = {
  jump: false,
  fire: false,
  reload: false,
  toggleView: false,
  alignCam: false,
  menu: false,
  nextWeapon: false,
  prevWeapon: false,
};

export function sampleActions(): Actions {
  const pad = firstPad();
  refreshPadMeta();
  const blocked = muted && !forced;

  if (rebindTo && pad) {
    for (let i = 0; i < pad.buttons.length; i++) {
      if (pad.buttons[i]?.pressed) {
        applyRebind("button", i);
        break;
      }
    }
  }

  const dz = settings.deadzone;
  let x = 0;
  let y = 0;
  let lookX = 0;
  let lookY = 0;

  if (!blocked && !rebindTo) {
    if (actionDown("right", pad)) x += 1;
    if (actionDown("left", pad)) x -= 1;
    if (actionDown("forward", pad)) y += 1;
    if (actionDown("back", pad)) y -= 1;
    x += touchMove.x;
    y += touchMove.y;

    if (pad) {
      const stick = radial(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0), dz);
      x += stick.x;
      y += stick.y;
      const look = radial(pad.axes[2] ?? 0, pad.axes[3] ?? 0, dz);
      lookX = look.x * settings.stickSens;
      lookY = look.y * (settings.invertY ? -1 : 1) * settings.stickSens;
    }

    lookX += touchLook.x;
    lookY += touchLook.y * (settings.invertY ? -1 : 1);
  }

  const mag = Math.hypot(x, y);
  if (mag > 1) {
    x /= mag;
    y /= mag;
  }

  padState.stickX = lookX;
  padState.stickY = lookY;

  const jump = !blocked && actionDown("jump", pad);
  const fire = !blocked && (mouse.fireHeld || actionDown("fire", pad));
  const aim = !blocked && (mouse.aimHeld || actionDown("aim", pad));
  const reload = !blocked && actionDown("reload", pad);
  const toggleView = !blocked && actionDown("toggleView", pad);
  const freeLook = !blocked && actionDown("freeLook", pad);
  const alignCam = !blocked && actionDown("alignCam", pad);
  const menu = actionDown("menu", pad);
  let weaponSlot: number | null = null;
  if (!blocked) {
    if (isDown("Digit1") || isDown("Numpad1")) weaponSlot = 0;
    else if (isDown("Digit2") || isDown("Numpad2")) weaponSlot = 1;
    else if (isDown("Digit3") || isDown("Numpad3")) weaponSlot = 2;
  }
  const nextHeld = !blocked && (actionDown("nextWeapon", pad) || wheelDir > 0);
  const prevHeld = !blocked && (actionDown("prevWeapon", pad) || wheelDir < 0);
  wheelDir = 0;

  edges.jump = jump && !prev.jump;
  edges.fire = fire && !prev.fire;
  edges.reload = reload && !prev.reload;
  edges.toggleView = toggleView && !prev.toggleView;
  edges.alignCam = alignCam && !prev.alignCam;
  edges.menu = menu && !prev.menu;
  edges.nextWeapon = nextHeld && !prev.nextWeapon;
  edges.prevWeapon = prevHeld && !prev.prevWeapon;
  prev.jump = jump;
  prev.fire = fire;
  prev.reload = reload;
  prev.toggleView = toggleView;
  prev.alignCam = alignCam;
  prev.menu = menu;
  prev.nextWeapon = nextHeld;
  prev.prevWeapon = prevHeld;

  return {
    moveX: blocked ? 0 : x,
    moveY: blocked ? 0 : y,
    jump,
    crouch: !blocked && actionDown("crouch", pad),
    sprint: !blocked && actionDown("sprint", pad),
    fire,
    aim,
    reload,
    toggleView,
    freeLook,
    alignCam,
    menu,
    weaponSlot,
    nextWeapon: nextHeld,
    prevWeapon: prevHeld,
    lookStickX: blocked ? 0 : lookX,
    lookStickY: blocked ? 0 : lookY,
    padActive: Boolean(pad),
  };
}

export function consumeLook() {
  const invert = settings.invertY ? -1 : 1;
  const dx = mouse.dx;
  const dy = mouse.dy * invert;
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.lookX = 0;
  mouse.lookY = 0;
  return { dx, dy };
}

const menuPrev = { up: false, down: false, left: false, right: false, ok: false, back: false, menu: false };
let stickArm = 0;

export type MenuNav = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  ok: boolean;
  back: boolean;
  menu: boolean;
};

export function pollMenu(): MenuNav {
  const pad = firstPad();
  refreshPadMeta();
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let ok = false;
  let back = false;
  let menuBtn = false;
  if (pad) {
    const b = pad.buttons;
    up = !!b[12]?.pressed;
    down = !!b[13]?.pressed;
    left = !!b[14]?.pressed;
    right = !!b[15]?.pressed;
    ok = !!b[0]?.pressed;
    back = !!b[1]?.pressed;
    menuBtn = !!b[9]?.pressed || !!b[8]?.pressed;
    const sx = pad.axes[0] ?? 0;
    const sy = pad.axes[1] ?? 0;
    const now = performance.now();
    const dz = 0.55;
    if (Math.abs(sx) > dz || Math.abs(sy) > dz) {
      if (now > stickArm) {
        if (sy < -dz) up = true;
        else if (sy > dz) down = true;
        if (sx < -dz) left = true;
        else if (sx > dz) right = true;
        stickArm = now + 220;
      }
    } else {
      stickArm = 0;
    }
  }
  const nav: MenuNav = {
    up: up && !menuPrev.up,
    down: down && !menuPrev.down,
    left: left && !menuPrev.left,
    right: right && !menuPrev.right,
    ok: ok && !menuPrev.ok,
    back: back && !menuPrev.back,
    menu: menuBtn && !menuPrev.menu,
  };
  menuPrev.up = up;
  menuPrev.down = down;
  menuPrev.left = left;
  menuPrev.right = right;
  menuPrev.ok = ok;
  menuPrev.back = back;
  menuPrev.menu = menuBtn;
  return nav;
}

