export type ToolId = "axe" | "gun";
export type BuildPart = "floor" | "wall";
export type CamMode = "first" | "third";

export type BindAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "jump"
  | "sprint"
  | "menu"
  | "cam";

export type Bindings = Record<BindAction, string>;

export const DEFAULT_BINDS: Bindings = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  sprint: "ShiftLeft",
  menu: "KeyM",
  cam: "KeyC",
};

/** Standard Gamepad button index. */
export type PadAction =
  | "confirm"
  | "back"
  | "jump"
  | "fire"
  | "sprint"
  | "menu"
  | "cam"
  | "pause"
  | "cyclePrev"
  | "cycleNext";

export type PadBindings = Record<PadAction, number>;

export const DEFAULT_PAD_BINDS: PadBindings = {
  confirm: 0,
  back: 1,
  jump: 0,
  fire: 7,
  sprint: 6,
  menu: 3,
  cam: 2,
  pause: 8,
  cyclePrev: 4,
  cycleNext: 5,
};

export type PlayerRecord = {
  id: string;
  name: string;
  charId: string;
  createdAt: number;
};

export type Inventory = {
  wood: number;
  tool: ToolId;
};

export type SavedPiece = {
  kind: BuildPart;
  gx: number;
  gy: number;
  gz: number;
  rot: number;
};

export type HudSnap = {
  wood: number;
  tool: ToolId;
  part: BuildPart;
  buildMode: boolean;
  menuOpen: boolean;
  paused: boolean;
  locked: boolean;
  cam: CamMode;
  loading: string | null;
  hint: string;
  pad?: boolean;
};
