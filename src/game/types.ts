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
