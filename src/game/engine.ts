import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { loadCharacter, type CharacterRig } from "./load-character";
import { loadInv, saveInv, loadBuild, saveBuild } from "./inventory";
import { loadSfx, playSfx, unlockAudio } from "./audio";
import { getPadBinds, readPad } from "./pad";
import type {
  Bindings,
  BuildPart,
  CamMode,
  HudSnap,
  SavedPiece,
  ToolId,
} from "./types";

const CELL = 2;
const MAP_HALF = 22;
const WALL_INSET = 2;
const INNER = MAP_HALF - WALL_INSET * CELL;
const LEVEL_H = 3;
const PLAYER_R = 0.42;
const TREE_R = 0.7;
const EYE = 1.56;
const WALK = 5.4;
const SPRINT = 8.1;
const FACE = Math.PI;

const gltf = new GLTFLoader();
const fbx = new FBXLoader();
const tex = new THREE.TextureLoader();

function loadGltf(url: string) {
  return new Promise<THREE.Group>((resolve, reject) => {
    gltf.load(url, (g) => resolve(g.scene), undefined, reject);
  });
}
function loadFbx(url: string) {
  return new Promise<THREE.Group>((resolve, reject) => {
    fbx.load(url, (g) => resolve(g), undefined, reject);
  });
}
function loadTex(url: string) {
  return new Promise<THREE.Texture>((resolve, reject) => {
    tex.load(url, resolve, undefined, reject);
  });
}

function worldLen(obj: THREE.Object3D, len: number) {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const m = Math.max(size.x, size.y, size.z) || 1;
  obj.scale.multiplyScalar(len / m);
}

type Tree = {
  group: THREE.Group;
  x: number;
  z: number;
  hp: number;
  falling: number;
};

type Piece = {
  kind: BuildPart;
  gx: number;
  gy: number;
  gz: number;
  rot: number;
  mesh: THREE.Object3D;
};

export type EngineOpts = {
  canvas: HTMLCanvasElement;
  playerId: string;
  charId: string;
  binds: Bindings;
  onHud: (h: HudSnap) => void;
  onQuit?: () => void;
};

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.08, 180);
  private clock = new THREE.Clock();
  private opts: EngineOpts;
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private pos = new THREE.Vector3(0, 0, 0);
  private vy = 0;
  private grounded = true;
  private cam: CamMode = "third";
  private tool: ToolId = "axe";
  private part: BuildPart = "floor";
  private buildMode = false;
  private menuOpen = false;
  private paused = false;
  private locked = false;
  private fireHeld = false;
  private placeArmed = false;
  private gunCd = 0;
  private axeCd = 0;
  private wood = 0;
  private playerId: string;
  private rig: CharacterRig | null = null;
  private axe = new THREE.Group();
  private gun = new THREE.Group();
  private axeGrip = new THREE.Group();
  private gunGrip = new THREE.Group();
  private flash: THREE.Mesh;
  private trees: Tree[] = [];
  private pieces: Piece[] = [];
  private colliders: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  private wallProto: THREE.Object3D | null = null;
  private floorProto: THREE.Object3D | null = null;
  private ghost = new THREE.Group();
  private ghostOk = false;
  private ray = new THREE.Raycaster();
  private hint = "Click to play";
  private loading: string | null = "Loading camp…";
  private running = false;
  private disposed = false;
  private lastHud = "";
  private speed = 0;
  private chopSwing = 0;
  private gunKick = 0;
  private lookTouch: { id: number; x: number; y: number } | null = null;
  private moveStick = { x: 0, y: 0 };
  private padMove = { x: 0, y: 0 };
  private padSprint = false;
  private padJump = false;
  private padConnected = false;
  private padPrev: boolean[] = [];
  private padTrig = false;

  constructor(opts: EngineOpts) {
    this.opts = opts;
    this.playerId = opts.playerId;
    const inv = loadInv(opts.playerId);
    this.wood = inv.wood;
    this.tool = inv.tool;
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0 }),
    );
    this.gunGrip.add(this.flash);
    this.flash.position.set(0, 0.02, -0.18);
    this.bind();
    this.resize();
  }

  private hud() {
    const snap: HudSnap = {
      wood: this.wood,
      tool: this.tool,
      part: this.part,
      buildMode: this.buildMode,
      menuOpen: this.menuOpen,
      paused: this.paused,
      locked: this.locked,
      cam: this.cam,
      loading: this.loading,
      hint: this.hint,
      pad: this.padConnected,
    };
    const k = JSON.stringify(snap);
    if (k === this.lastHud) return;
    this.lastHud = k;
    this.opts.onHud(snap);
  }

  private bind() {
    const c = this.opts.canvas;
    c.addEventListener("click", () => this.requestLock());
    document.addEventListener("pointerlockchange", this.onLock);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
    window.addEventListener("resize", this.resize);
    document.addEventListener("mousemove", this.onMouse);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private unbind() {
    document.removeEventListener("pointerlockchange", this.onLock);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearKeys);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("mousemove", this.onMouse);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("wheel", this.onWheel);
  }

  private onLock = () => {
    this.locked = document.pointerLockElement === this.opts.canvas;
    if (!this.locked) this.fireHeld = false;
    this.hint = this.locked ? "" : "Click to play";
    this.hud();
  };

  requestLock() {
    if (this.menuOpen || this.paused || this.loading) return;
    const c = this.opts.canvas as HTMLCanvasElement & {
      requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
    };
    const p = c.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | void;
    if (p && typeof p.then === "function") p.catch(() => c.requestPointerLock());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const code = e.code;
    if (code === "Escape") {
      this.setPaused(true);
      return;
    }
    const b = this.opts.binds;
    if (code === b.menu) {
      e.preventDefault();
      this.toggleMenu();
      return;
    }
    if (this.menuOpen || this.paused) return;
    if (code === b.cam) this.toggleCam();
    this.keys.add(code);
    if (code === "Digit1") this.setToolOrPart(0);
    if (code === "Digit2") this.setToolOrPart(1);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clearKeys = () => {
    this.keys.clear();
    this.fireHeld = false;
  };

  private onMouse = (e: MouseEvent) => {
    if (!this.locked || this.menuOpen || this.paused) return;
    this.yaw -= e.movementX * 0.0022;
    this.pitch -= e.movementY * 0.0022;
    const lim = Math.PI / 2 - 0.04;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (!this.locked || this.menuOpen || this.paused) return;
    this.fireHeld = true;
    this.placeArmed = true;
    this.fire(false);
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button !== 0) return;
    this.fireHeld = false;
    this.placeArmed = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.locked || this.menuOpen || this.paused) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    this.cycle(dir);
  };

  private cycle(dir: number) {
    if (this.buildMode) this.part = this.part === "floor" ? "wall" : "floor";
    else this.setTool(this.tool === "axe" ? "gun" : "axe");
    void dir;
    this.hud();
  }

  private setToolOrPart(i: number) {
    if (this.buildMode) this.part = i === 0 ? "floor" : "wall";
    else this.setTool(i === 0 ? "axe" : "gun");
    this.hud();
  }

  setTool(t: ToolId) {
    if (this.buildMode) return;
    this.tool = t;
    this.axe.visible = t === "axe";
    this.gun.visible = t === "gun";
    saveInv(this.playerId, { wood: this.wood, tool: this.tool });
    this.hud();
  }

  setBuildMode(on: boolean) {
    this.buildMode = on;
    this.menuOpen = false;
    this.ghost.visible = on;
    if (on) {
      this.axe.visible = false;
      this.gun.visible = false;
    } else {
      this.axe.visible = this.tool === "axe";
      this.gun.visible = this.tool === "gun";
    }
    this.hud();
    this.requestLock();
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      this.paused = false;
      document.exitPointerLock();
    }
    this.hud();
  }

  closeMenu() {
    this.menuOpen = false;
    this.hud();
  }

  setPaused(v: boolean) {
    this.paused = v;
    this.menuOpen = false;
    if (v) document.exitPointerLock();
    this.hud();
  }

  toggleCam() {
    this.cam = this.cam === "third" ? "first" : "third";
    this.rig?.hideHead(this.cam === "first");
    this.dockTools();
    this.hud();
  }

  private dockTools() {
    const axeP = this.cam === "first" ? this.camera : (this.rig?.hand ?? this.scene);
    const gunP = axeP;
    axeP.add(this.axeGrip);
    gunP.add(this.gunGrip);
    if (this.cam === "first") {
      this.axeGrip.position.set(0.28, -0.26, -0.48);
      this.axeGrip.rotation.set(-0.35, Math.PI, 0.15);
      this.gunGrip.position.set(0.22, -0.18, -0.42);
      this.gunGrip.rotation.set(0.04, Math.PI, 0);
    } else {
      this.axeGrip.position.set(0.04, 0.02, 0.02);
      this.axeGrip.rotation.set(Math.PI / 2, Math.PI, 0.15);
      this.gunGrip.position.set(0.03, 0.04, 0.06);
      this.gunGrip.rotation.set(0, Math.PI / 2, Math.PI / 2);
    }
  }

  private resize = () => {
    const c = this.opts.canvas;
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  async start() {
    this.loading = "Loading camp…";
    this.hud();
    this.scene.background = new THREE.Color("#8aa3b0");
    this.scene.fog = new THREE.Fog("#8aa3b0", 28, 70);

    const hemi = new THREE.HemisphereLight(0xe8f0f6, 0x4a453c, 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4de, 1.55);
    sun.position.set(18, 28, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -36;
    sun.shadow.camera.right = 36;
    sun.shadow.camera.top = 36;
    sun.shadow.camera.bottom = -36;
    this.scene.add(sun);

    const [grass, treeSrc, wallSrc, floorSrc, axeSrc, gunSrc, colorMap] = await Promise.all([
      loadTex("/env/ground/grass.png"),
      loadGltf("/env/trees/CommonTree_1.gltf"),
      loadGltf("/env/build/wall-wood.glb"),
      loadGltf("/env/build/planks.glb"),
      loadGltf("/env/tools/axe.gltf"),
      loadFbx("/env/gun/Makarov.fbx"),
      loadTex("/env/gun/Makarov_Base_Color.png"),
      loadSfx("axe", "/env/sfx/axe-hit.mp3").catch(() => undefined),
      loadSfx("fall", "/env/sfx/tree-fall.mp3").catch(() => undefined),
      unlockAudio(),
    ]);

    grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    grass.repeat.set(36, 36);
    grass.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_HALF * 2 + 8, MAP_HALF * 2 + 8),
      new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.wallProto = wallSrc;
    this.floorProto = floorSrc;
    this.prepProto(this.wallProto, CELL, 1, 0.18);
    this.prepProto(this.floorProto, CELL * 0.98, 0.12, CELL * 0.98);

    this.buildPerimeter();
    this.spawnTrees(treeSrc);
    this.restorePieces();

    this.axe.add(axeSrc);
    worldLen(this.axe, 0.55);
    this.axeGrip.add(this.axe);

    colorMap.colorSpace = THREE.SRGBColorSpace;
    gunSrc.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.material = new THREE.MeshStandardMaterial({
          map: colorMap,
          metalness: 0.65,
          roughness: 0.35,
        });
      }
    });
    this.gun.add(gunSrc);
    worldLen(this.gun, 0.24);
    this.gunGrip.add(this.gun);

    this.rig = await loadCharacter(this.opts.charId, 1.72);
    this.scene.add(this.rig.wrap);
    this.dockTools();
    this.setTool(this.tool);

    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.loading = null;
    this.running = true;
    this.clock.start();
    this.hud();
    this.installProbe();
    this.renderer.setAnimationLoop(this.tick);
  }

  private prepProto(obj: THREE.Object3D, w: number, h: number, d: number) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const sx = size.x || 1,
      sy = size.y || 1,
      sz = size.z || 1;
    obj.scale.set(w / sx, h / sy, d / sz);
    obj.position.sub(box.getCenter(new THREE.Vector3()).multiply(obj.scale));
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  private makeWall() {
    const g = new THREE.Group();
    if (!this.wallProto) return g;
    for (let i = 0; i < 3; i++) {
      const c = this.wallProto.clone(true);
      c.position.y = i * 1 + 0.5;
      g.add(c);
    }
    return g;
  }

  private makeFloor() {
    const g = new THREE.Group();
    if (!this.floorProto) return g;
    const c = this.floorProto.clone(true);
    c.position.y = 0.06;
    g.add(c);
    return g;
  }

  private buildPerimeter() {
    const inner = INNER;
    for (let x = -inner; x <= inner; x += CELL) {
      this.placeWorldWall(x, -inner, 0, true);
      this.placeWorldWall(x, inner, 0, true);
    }
    for (let z = -inner + CELL; z <= inner - CELL; z += CELL) {
      this.placeWorldWall(-inner, z, Math.PI / 2, true);
      this.placeWorldWall(inner, z, Math.PI / 2, true);
    }
    // South gate — two-cell opening so the reserved outer strip is reachable later.
    // (walls still exist on that row except a hole at x in [-CELL, CELL] z = -inner)
  }

  private placeWorldWall(x: number, z: number, rot: number, collider: boolean) {
    const m = this.makeWall();
    m.position.set(x, 0, z);
    m.rotation.y = rot;
    this.scene.add(m);
    if (!collider) return;
    const hw = rot === 0 ? CELL * 0.5 : 0.16;
    const hd = rot === 0 ? 0.16 : CELL * 0.5;
    this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }

  private spawnTrees(src: THREE.Object3D) {
    const pts: { x: number; z: number }[] = [];
    const margin = INNER - 3.2;
    let guard = 0;
    while (pts.length < 22 && guard++ < 800) {
      const x = (Math.random() * 2 - 1) * margin;
      const z = (Math.random() * 2 - 1) * margin;
      if (x * x + z * z < 7.5 * 7.5) continue;
      if (pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 6.2 * 6.2)) continue;
      pts.push({ x, z });
    }
    src.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    for (const p of pts) {
      const g = src.clone(true) as THREE.Group;
      const box = new THREE.Box3().setFromObject(g);
      const size = new THREE.Vector3();
      box.getSize(size);
      const s = 4.8 / Math.max(size.y, 1);
      g.scale.setScalar(s);
      g.position.set(p.x, -box.min.y * s, p.z);
      g.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(g);
      this.trees.push({ group: g, x: p.x, z: p.z, hp: 3, falling: -1 });
    }
  }

  private restorePieces() {
    for (const s of loadBuild(this.playerId)) this.spawnPiece(s, false);
  }

  private persist() {
    saveBuild(
      this.playerId,
      this.pieces.map(({ kind, gx, gy, gz, rot }) => ({ kind, gx, gy, gz, rot })),
    );
    saveInv(this.playerId, { wood: this.wood, tool: this.tool });
  }

  private spawnPiece(s: SavedPiece, save: boolean) {
    const mesh = s.kind === "wall" ? this.makeWall() : this.makeFloor();
    mesh.position.set(s.gx * CELL, s.gy * LEVEL_H, s.gz * CELL);
    mesh.rotation.y = s.rot;
    this.scene.add(mesh);
    this.pieces.push({ ...s, mesh });
    if (s.kind === "wall") {
      const x = s.gx * CELL,
        z = s.gz * CELL;
      const hw = Math.abs(Math.cos(s.rot)) > 0.5 ? CELL * 0.5 : 0.16;
      const hd = Math.abs(Math.sin(s.rot)) > 0.5 ? CELL * 0.5 : 0.16;
      this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
    }
    if (save) this.persist();
  }

  private fire(repeat: boolean) {
    if (this.menuOpen || this.paused || this.loading) return;
    if (this.buildMode) {
      if (!repeat && this.placeArmed) {
        this.placeArmed = false;
        this.placeBuild();
      }
      return;
    }
    if (this.tool === "axe") {
      if (this.axeCd > 0) return;
      this.axeCd = 0.38;
      this.chopSwing = 0.32;
      this.rig?.playChop();
      this.chop();
    } else {
      if (this.gunCd > 0) return;
      this.gunCd = 0.18;
      this.gunKick = 0.22;
      this.rig?.playFire();
      this.shoot();
    }
  }

  private chop() {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let best: Tree | null = null;
    let bestD = 2.45;
    for (const t of this.trees) {
      if (t.hp <= 0) continue;
      const dx = t.x - this.pos.x;
      const dz = t.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const along = dx * fx + dz * fz;
      if (d < bestD && along > 0.2) {
        best = t;
        bestD = d;
      }
    }
    playSfx("axe", 0.8);
    if (!best) return;
    best.hp -= 1;
    if (best.hp <= 0) {
      best.falling = 0;
      this.wood += 5;
      playSfx("fall", 0.9);
      this.persist();
      this.hud();
    }
  }

  private shoot() {
    const flashMat = this.flash.material as THREE.MeshBasicMaterial;
    flashMat.opacity = 1;
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.ray.intersectObjects(
      this.trees.map((t) => t.group),
      true,
    );
    if (hits[0]) {
      const obj = hits[0].object;
      const tree = this.trees.find((t) => {
        let p: THREE.Object3D | null = obj;
        while (p) {
          if (p === t.group) return true;
          p = p.parent;
        }
        return false;
      });
      if (tree && tree.hp > 0) {
        tree.hp -= 1;
        if (tree.hp <= 0) {
          tree.falling = 0;
          this.wood += 3;
          playSfx("fall", 0.7);
          this.persist();
        }
      }
    }
    this.hud();
  }

  private placeBuild() {
    if (!this.ghostOk) return;
    const cost = this.part === "floor" ? 2 : 3;
    if (this.wood < cost) {
      this.hint = `Need ${cost} wood`;
      this.hud();
      return;
    }
    const g = this.ghost.userData as SavedPiece;
    const exists = this.pieces.some(
      (p) => p.kind === g.kind && p.gx === g.gx && p.gy === g.gy && p.gz === g.gz && p.rot === g.rot,
    );
    if (exists) return;
    this.wood -= cost;
    this.spawnPiece({ kind: g.kind, gx: g.gx, gy: g.gy, gz: g.gz, rot: g.rot }, true);
    this.hud();
  }

  private updateGhost() {
    if (!this.buildMode) {
      this.ghost.visible = false;
      return;
    }
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const tx = this.pos.x + fx * 2.4;
    const tz = this.pos.z + fz * 2.4;
    const gx = Math.round(tx / CELL);
    const gz = Math.round(tz / CELL);
    const gy = Math.round(this.pos.y / LEVEL_H);
    const facingX = Math.abs(fx) > Math.abs(fz);
    const rot = this.part === "wall" ? (facingX ? Math.PI / 2 : 0) : 0;
    this.ghost.clear();
    const mesh = this.part === "wall" ? this.makeWall() : this.makeFloor();
    mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = new THREE.MeshStandardMaterial({
          color: 0xc9c2b4,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        });
        m.castShadow = false;
      }
    });
    this.ghost.add(mesh);
    this.ghost.position.set(gx * CELL, gy * LEVEL_H, gz * CELL);
    this.ghost.rotation.y = rot;
    this.ghost.visible = true;
    const inside = Math.abs(gx * CELL) < INNER - 0.1 && Math.abs(gz * CELL) < INNER - 0.1;
    this.ghostOk = inside;
    this.ghost.userData = { kind: this.part, gx, gy, gz, rot } satisfies SavedPiece;
  }

  private collide(nx: number, nz: number) {
    let x = nx;
    let z = nz;
    const r = PLAYER_R;
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d = Math.hypot(dx, dz);
      if (d < r && d > 1e-5) {
        const k = (r - d) / d;
        x += dx * k;
        z += dz * k;
      } else if (d < 1e-5) {
        x += r;
      }
    }
    for (const t of this.trees) {
      if (t.hp <= 0) continue;
      const dx = x - t.x;
      const dz = z - t.z;
      const d = Math.hypot(dx, dz);
      const need = PLAYER_R + TREE_R;
      if (d < need && d > 1e-4) {
        const k = (need - d) / d;
        x += dx * k;
        z += dz * k;
      }
    }
    const lim = INNER - PLAYER_R - 0.05;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    return { x, z };
  }

  private supportY() {
    let y = 0;
    for (const p of this.pieces) {
      if (p.kind !== "floor") continue;
      const fx = p.gx * CELL;
      const fz = p.gz * CELL;
      if (Math.abs(this.pos.x - fx) < CELL * 0.48 && Math.abs(this.pos.z - fz) < CELL * 0.48) {
        const top = p.gy * LEVEL_H + 0.14;
        if (this.pos.y + 0.35 >= top) y = Math.max(y, top);
      }
    }
    return y;
  }

  private tick = () => {
    if (this.disposed) return;
    let dt = this.clock.getDelta();
    dt = Math.min(dt, 0.08);
    this.pollPad(dt);
    if (this.paused || this.menuOpen) {
      this.renderer.render(this.scene, this.camera);
      this.hud();
      return;
    }
    if (this.loading) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.gunCd = Math.max(0, this.gunCd - dt);
    this.axeCd = Math.max(0, this.axeCd - dt);
    this.chopSwing = Math.max(0, this.chopSwing - dt);
    this.gunKick = Math.max(0, this.gunKick - dt);
    const flashMat = this.flash.material as THREE.MeshBasicMaterial;
    flashMat.opacity = Math.max(0, flashMat.opacity - dt * 8);

    if (this.fireHeld) this.fire(true);

    const b = this.opts.binds;
    let ix = 0,
      iz = 0;
    if (this.keys.has(b.forward)) iz += 1;
    if (this.keys.has(b.back)) iz -= 1;
    if (this.keys.has(b.right)) ix += 1;
    if (this.keys.has(b.left)) ix -= 1;
    ix += this.moveStick.x;
    iz += this.moveStick.y;
    ix += this.padMove.x;
    iz += this.padMove.y;
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }
    const sprint = this.keys.has(b.sprint) || this.padSprint;
    const sp = sprint ? SPRINT : WALK;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const vx = (fx * iz + rx * ix) * sp;
    const vz = (fz * iz + rz * ix) * sp;
    this.speed = Math.hypot(vx, vz);
    const next = this.collide(this.pos.x + vx * dt, this.pos.z + vz * dt);
    this.pos.x = next.x;
    this.pos.z = next.z;

    if ((this.keys.has(b.jump) || this.padJump) && this.grounded) {
      this.vy = 6.2;
      this.grounded = false;
    }
    this.vy -= 18 * dt;
    this.pos.y += this.vy * dt;
    const support = this.supportY();
    if (this.pos.y <= support) {
      this.pos.y = support;
      this.vy = 0;
      this.grounded = true;
    }

    this.rig?.setMoving(this.speed > 0.4 && this.grounded);
    this.rig?.update(dt);
    if (this.rig) {
      this.rig.wrap.position.copy(this.pos);
      this.rig.wrap.rotation.y = this.yaw + FACE;
    }

    if (this.chopSwing > 0) {
      const u = 1 - this.chopSwing / 0.32;
      const ang = u < 0.4 ? THREE.MathUtils.lerp(0.2, -1.2, u / 0.4) : THREE.MathUtils.lerp(-1.2, 1.1, (u - 0.4) / 0.6);
      this.axe.rotation.z = ang;
    } else this.axe.rotation.z = 0.15;
    this.gun.rotation.x = this.gunKick > 0 ? -0.28 * (this.gunKick / 0.22) : 0;

    for (const t of this.trees) {
      if (t.falling < 0) continue;
      t.falling += dt;
      t.group.rotation.z = Math.min(1.4, t.falling * 1.5);
      t.group.position.y = Math.max(-1.2, t.group.position.y - dt * 0.4);
      if (t.falling > 1.6) {
        t.group.visible = false;
        t.falling = -2;
      }
    }

    this.updateGhost();
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.hud();
  };

  private updateCamera() {
    if (this.cam === "first") {
      this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      if (this.rig) this.rig.wrap.visible = true;
      this.rig?.hideHead(true);
    } else {
      this.rig?.hideHead(false);
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const dist = 4.2;
      const desired = new THREE.Vector3(
        this.pos.x - fx * dist,
        this.pos.y + 1.72,
        this.pos.z - fz * dist,
      );
      this.camera.position.lerp(desired, 0.18);
      const look = new THREE.Vector3(this.pos.x, this.pos.y + 1.35, this.pos.z);
      this.camera.lookAt(look);
    }
  }

  setMoveStick(x: number, y: number) {
    this.moveStick.x = x;
    this.moveStick.y = y;
  }

  private pollPad(dt: number) {
    this.padMove.x = 0;
    this.padMove.y = 0;
    this.padSprint = false;
    this.padJump = false;
    const { frame, nextPrev } = readPad(this.padPrev);
    this.padPrev = nextPrev;
    this.padConnected = frame.connected;
    if (!frame.connected) {
      if (this.padTrig) {
        this.padTrig = false;
        this.fireHeld = false;
      }
      return;
    }
    this.padMove.x = frame.moveX;
    this.padMove.y = frame.moveY;
    const pb = getPadBinds();
    const canLook = !this.menuOpen && !this.paused && !this.loading;
    if (canLook) {
      this.yaw -= frame.lookX * 2.5 * dt;
      this.pitch -= frame.lookY * 2.1 * dt;
      const lim = Math.PI / 2 - 0.04;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    }
    this.padSprint = frame.held(pb.sprint);
    const trig = frame.held(pb.fire);
    if (canLook) {
      if (trig && !this.padTrig) {
        this.placeArmed = true;
        this.fireHeld = true;
        this.fire(false);
      } else if (!trig && this.padTrig) {
        this.fireHeld = false;
        this.placeArmed = false;
      }
      this.padTrig = trig;
    } else if (this.padTrig) {
      this.padTrig = false;
      this.fireHeld = false;
    }
    if (this.paused) return;
    if (frame.edge(pb.confirm) || frame.edge(pb.jump)) {
      if (this.menuOpen) this.closeMenu();
      else {
        if (!this.locked) this.requestLock();
        this.padJump = true;
      }
    }
    if (frame.edge(pb.back)) {
      if (this.menuOpen) this.closeMenu();
      else this.setPaused(true);
    }
    if (frame.edge(pb.cam)) this.toggleCam();
    if (frame.edge(pb.menu)) this.toggleMenu();
    if (frame.edge(pb.cyclePrev)) this.cycle(-1);
    if (frame.edge(pb.cycleNext)) this.cycle(1);
    if (frame.edge(pb.pause)) this.setPaused(!this.paused);
  }

  lookDelta(dx: number, dy: number) {
    this.yaw -= dx * 0.003;
    this.pitch -= dy * 0.003;
    const lim = Math.PI / 2 - 0.04;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  holdFire(v: boolean) {
    this.fireHeld = v;
    if (v) {
      this.placeArmed = true;
      this.fire(false);
    } else this.placeArmed = false;
  }

  private installProbe() {
    window.__controlsTest = {
      getYaw: () => this.yaw,
      getSpeed: () => this.speed,
      setKeys: (codes: string[]) => {
        this.keys = new Set(codes);
      },
      setYaw: (v: number) => {
        this.yaw = v;
      },
      setPitch: (v: number) => {
        this.pitch = v;
      },
      fire: () => {
        this.placeArmed = true;
        this.fire(false);
      },
      getWood: () => this.wood,
      getCam: () => this.cam,
      giveWood: (n: number) => {
        this.wood += n;
        this.persist();
        this.hud();
      },
      setTool: (t: string) => this.setTool(t === "gun" ? "gun" : "axe"),
      toggleCam: () => this.toggleCam(),
      setFireHeld: (v: boolean) => this.holdFire(v),
      freeze: (v: boolean) => this.setPaused(v),
      setBuild: (v: boolean) => this.setBuildMode(v),
      debug: () => ({
        yaw: this.yaw,
        pos: this.pos.toArray(),
        cam: this.cam,
        wood: this.wood,
        pad: this.padConnected,
        trees: this.trees.filter((t) => t.hp > 0).length,
      }),
      capture: () => this.opts.canvas.toDataURL("image/jpeg", 0.6),
    };
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.unbind();
    this.renderer.dispose();
    if (window.__controlsTest) delete window.__controlsTest;
  }
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
      setYaw?: (v: number) => void;
      setPitch?: (v: number) => void;
      fire?: () => void;
      getWood?: () => number;
      getCam?: () => string;
      giveWood?: (n: number) => void;
      setTool?: (t: string) => void;
      toggleCam?: () => void;
      setFireHeld?: (v: boolean) => void;
      freeze?: (v: boolean) => void;
      setBuild?: (v: boolean) => void;
      debug?: () => unknown;
      capture?: () => string;
    };
  }
}
