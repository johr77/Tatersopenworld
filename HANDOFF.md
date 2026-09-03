# Tater's Open World — agent handoff

**Read this file before touching any code.** Update it in the same turn you change behavior, files, or the next-step list. Wes (owner) uses this so a new agent can continue without rebuilding.

| | |
|---|---|
| Game | Tater's Open World — lumberjack survival, FPS + third-person chase cam |
| Owner | Wes Johnson (GitHub **johr77**) |
| GitHub | https://github.com/johr77/Tatersopenworld (public, `main`) |
| Auth / DB | **OFF.** Players, inventory, builds, keybinds → `localStorage` only |
| Preview | `startup.sh` → `npm run dev` on `0.0.0.0:8080`. Leave it running. |
| This file | `/workspace/HANDOFF.md` **and** `/workspace/artifacts/HANDOFF.md` (artifacts persist across Grok conversations) |
| Project instructions | `/workspace/AGENTS.project.md` — integrity rule. Sandbox contract is `/workspace/AGENTS.md` (do not push that). |

---

## DO NOT REBUILD

The playable game **already exists** in this workspace.

A previous sandbox reset wiped `src/game` and the next agent rebuilt from scratch. Wes does not want that again. He will push GitHub more often so a lost sandbox can be recovered.

**If any of these exist, you are in the right project — edit in place:**

- `src/game/engine.ts`
- `src/game/load-character.ts`
- `src/routes/index.tsx`
- `public/env/chars/` (Quaternius UBC glTF)
- `startup.sh`

**If they are missing:** STOP. Do **not** scaffold a new app. Print the warning in `AGENTS.project.md`, then recover from GitHub (`johr77/Tatersopenworld`) or ask Wes. Rebuild only if Wes says so in that turn.

**If the game looks incomplete or “wrong”:** that is a bug/polish ticket, not a rebuild. Patch the file. If you believe a rewrite is required, **warn Wes and wait**.

---

## What the player sees (flow)

Title **Enter** → roster (empty at first) → **New** (name + 8 UBC looks) → back to roster → pick player → hub **Play** / Options / Switch player.

In world: WASD + mouse look, click-to-play pointer lock, **left click** uses the current tool, **wheel / 1 / 2** cycle, **C** camera, **M** radial menu (Build / Exit build), **Esc** pause. Delete player = trash on the roster.

Build mode: floor + wall in the bottom box; wheel cycles parts; one piece per click; walls are 3 stacked Kenney 1 m segments (`LEVEL_H = 3`). Combat bar is axe + gun; build parts are **not** selectable outside build mode.

---

## Layout (source of truth)

```
src/game/engine.ts          world, input, trees, build, tools, camera, __controlsTest
src/game/load-character.ts  UBC glTF + bake hair onto Head + procedural idle/walk/chop/fire
src/game/characters.ts      8 looks (body + hairs[])
src/game/players.ts         localStorage tater-players
src/game/inventory.ts       tater-inv-${id}, tater-build-${id}
src/game/bindings.ts        tater-binds (M = menu, rebindable)
src/game/types.ts           tools, parts, binds
src/game/audio.ts           axe-hit + tree-fall, unlock on gesture
src/components/game-screen.tsx
src/components/player-screens.tsx
src/components/character-preview.tsx   Three.js creates its own canvas (Strict Mode)
src/components/options-panel.tsx
src/routes/index.tsx        ssr: false (three.js must not run on the server)
public/env/                 runtime copy of selected CC0 assets
```

GitHub also has the full dump at `CC0files/` (Quaternius UBC, KayKit, Kenney Fantasy Town, nature kit, Makarov, sounds). `public/env/` is the subset the game actually loads.

---

## Character system

**Assets:** Quaternius *Universal Base Characters [Standard]* — Superhero Male/Female full-body glTF (Godot/UE). These are **nude athletic base meshes**. Clothes are **later** (Wes). That look is expected until clothing ships.

Bones are Unreal-style (`pelvis`, `thigh_l`, `hand_r`, `Head`), **not** Mixamo. No animation clips in the files. Walk/idle/chop/fire are procedural in `load-character.ts` (offset from rest quaternions).

Hair files live in `public/env/hair/` (“Rigged to Head Bone”). Each hair glTF contains a **full extra armature** plus a `Hair_*` skinned mesh whose **vertices are already in bind-pose world space** (y ≈ 1.5–1.8 m, on the skull).

**Do NOT parent the whole hair scene to Head** — that doubles the offset and floats the cut above the face.

**Do NOT keep the extra armature and copy body bone quats onto it** — Buzzed/Beard/SimpleParted match the male rest; Long/Buns/BuzzedFemale match the female rest. Syncing across that mismatch (Wynn, Sage) *and* even same-gender Long/Buns lifted the volume off the skull.

**Correct attach (`attachHairToHead` in `load-character.ts`):** clone the hair glTF, take the skinned mesh, clone its geometry (bind-pose verts), transform those verts from inner/character space into the *body* Head’s local space, parent a **static** `Mesh` to Head, discard the extra armature. Hair sits on the scalp and follows walk/idle because it is a child of Head. Bram stacks two meshes (buzzed + beard) on the same Head.

Hair materials: `alphaTest = 0.4` (strand textures have alpha; do not alpha-blend). Idle uses a constant A-pose drop (`APOSE = 0.56` on upperarm Z) plus a little elbow bend — not a T-pose.

Looks (`characters.ts`):

| Id | Label | Body | Hair files | Notes |
|---|---|---|---|---|
| ash | Ash | male | Hair_Buzzed | short scalp |
| rowan | Rowan | male | Hair_SimpleParted | thin parted cap, volume on one side |
| bram | Bram | male | Hair_Buzzed **+** Hair_Beard | scalp + beard |
| wynn | Wynn | male | Hair_Long | female-rest cut; bake-to-Head still sits |
| fern | Fern | female | Hair_Buns | two buns |
| pia | Pia | female | Hair_BuzzedFemale | short scalp |
| lumen | Lumen | female | Hair_Long | shoulder-length |
| sage | Sage | female | Hair_SimpleParted | male-rest cut; bake-to-Head still sits |

Scale wrap so standing height is ~1.7 m. Facing: Mixamo/glTF +Z vs yaw 0 = −Z → `body.rotation.y = yaw + Math.PI` (`FACE` in engine). Chase cam must see the **back**.

Hand: `hand_r`. Tools parented to hand in third person; to the camera as a viewmodel in first person. Fit world length with `getWorldScale` / bbox (do **not** use `1/protoUnit` — that made tools ~40 m once).

WebGL: never reuse a `<canvas>` across Strict Mode remounts. Let `WebGLRenderer` create the canvas and append it to a host div (`character-preview.tsx`, `game-screen.tsx`). Character preview uses ACES tone mapping + key/fill/rim so skin and hair read on the create screen. Camera is a 3/4 bust (`(0.2, 1.42, 2.55)` lookAt `(0, 1.02, 0)`).

---

## World / combat (already in)

| Thing | Detail |
|---|---|
| Grid | `CELL = 2`, `MAP_HALF = 22`, perimeter wall `WALL_INSET = 2` cells in (`INNER = 18`) |
| Trees | Inside the wall only, min spacing ~6.2 m, spawn hole ~7.5 m, trunk `TREE_R = 0.7` so the player can walk up and chop (`CHOP` reach ~2.45 m) |
| Chop | Axe, 3 HP, +5 wood, fall tilt, sfx `axe` / `fall` |
| Gun | Makarov FBX, hitscan, muzzle flash, cooldown, hold-to-fire |
| Place | One-shot (`placeArmed`); floor 2 wood, wall 3 wood |
| Move | FPS strafe: W +forward, A −right, D +right. Speed 5.4 / sprint 8.1. A is **not** steer. |
| Probe | `window.__controlsTest` (`getYaw`, `getSpeed`, `setKeys`, `setYaw`, `giveWood`, `setBuild`, `fire`, `debug`, `capture`, …) |

---

## Known bugs / next (keep this list current)

**Characters (2026-09-03 pass — done, eyeballed)**

- [x] Hair sits on the head (bake bind-pose verts into Head local, parent static mesh).
- [x] Distinct cuts: Buzzed / SimpleParted / Beard+Buzzed / Long / Buns / BuzzedFemale.
- [x] Bram: `Hair_Buzzed` + `Hair_Beard`.
- [x] Idle A-pose drop, not T-pose.
- [x] Brighter create-preview lighting (ACES + key/fill/rim).
- [ ] Clothes = later. Do not invent outfits.

**Soon (from Wes's last video notes, not all done)**

- [ ] Axe swing still needs a look-check (was backward once; procedural strike is supposed to go forward).
- [ ] Gun hard to see in third person; fire should kick + flash (flash exists).
- [ ] Radial menu around the player is a single **Build** chip, not a full ring yet.

**Do not**

- Turn auth/DB on.
- Spawn trees outside/behind the perimeter wall.
- Make M = mute (M is menu, rebindable in Options).
- Place more than one build piece per click.
- Rewrite `src/game` from scratch.
- Invent clothes this pass.
- Parent hair Armature to Head, or skin-sync a second armature.

---

## Git push (when Wes asks)

Repo already exists. **Keep `CC0files/`.** Do not push `node_modules`, `.grok`, `artifacts`, `attachments`, `screenshots`, sandbox `AGENTS.md`.

Do push: game source (`src/game`, `src/components`, routes, `startup.sh`), `public/env/`, `HANDOFF.md`, `AGENTS.project.md`, README.

Workspace often has **no `.git`**. Clone `Tatersopenworld`, copy project files in (do **not** overwrite `CC0files` with an empty folder), commit, push `main` as **johr77**. `github___push_files` is text-only and too small for `public/env` binaries — use `git` + `gh auth`.

Last GitHub commit before the full game source landed was scaffold-only (`365733c`). After a successful push, note the new SHA here.

---

## Changelog (newest first)

- **2026-09-03 (this turn):** Locked `HANDOFF.md` + `AGENTS.project.md` (warn-and-wait; never rebuild if `src/game` exists). Character pass: `hairs[]`, Bram buzzed+beard, **bake hair onto Head** (Long/Buns no longer float), A-pose idle, hair `alphaTest`, brighter preview lights. Copy of this file at `artifacts/HANDOFF.md`.
- **2026-09-03:** Sandbox had been wiped. Rebuilt playable camp from UBC/Kenney/KayKit/Makarov. Title→roster→hub→play. Perimeter wall, M menu, delete player, UBC bodies. Preview on 8080.
- **2026-09-03 earlier:** Grok outage. Playable FPS source lost. Pushed empty scaffold to GitHub; `CC0files/` survived on `main`.
- **Before outage:** Kenney Mixamo bodies, facing/T-pose/tool-scale/1-piece-place/3 m walls fixed. Wes video: walk/facing OK; axe swing backward; gun hard to see; wanted UBC, delete player, inset wall, M=menu.

Update this changelog every turn you ship.
