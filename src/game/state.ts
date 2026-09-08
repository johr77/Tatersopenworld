import type { LookId } from "./profiles";

export type ViewMode = "fps" | "third";

export const gameState = {
  ready: false,
  locked: false,
  playing: false,
  look: "male-ranger" as LookId,
  playerName: "",
  yaw: 0,
  pitch: 0,
  x: 0,
  y: 0,
  z: 8,
  speed: 0,
  grounded: true,
  crouched: false,
  sprinting: false,
  aiming: false,
  view: "third" as ViewMode,
  ammo: 30,
  magSize: 30,
  reserve: 90,
  reloading: false,
  clip: "Idle",
  hits: 0,
  loadError: "" as string,
  pad: false,
  padId: "",
  menuPulse: false,
  weapon: "Rifle",
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getBodyYaw?: () => number;
      getSpeed: () => number;
      getPosition: () => { x: number; y: number; z: number };
      getAnimScale?: () => number;
      getDebug?: () => unknown;
      setKeys: (codes: string[]) => void;
      setFire?: (v: boolean) => void;
      setAim?: (v: boolean) => void;
      setSteer?: (v: number) => void;
      setView?: (mode: "fps" | "third") => void;
      getWeapon?: () => string;
      setSlot?: (i: number) => void;
      getLook?: () => string;
    };
  }
}
