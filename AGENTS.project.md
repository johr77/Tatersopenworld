WORKSPACE INTEGRITY RULE — NON-NEGOTIABLE

This conversation is **Tater's Open World** (lumberjack survival, FPS + third person).
GitHub: https://github.com/johr77/Tatersopenworld
Auth / database: **OFF**. Preview: `startup.sh` → `npm run dev` on `0.0.0.0:8080`.

Before writing or changing any code you MUST:

1. Read **`/workspace/HANDOFF.md`** first (persistent copy: `/workspace/artifacts/HANDOFF.md`). That file is the live agent brief. **Update it every turn** you change behavior, files, or the next-step list.
2. List the actual files in `/workspace`. Quote the project name and the main files you can see.
3. **If these exist, you are in the right project — EDIT IN PLACE. Never rebuild. Never scaffold a replacement app. Never rewrite `src/game` from scratch.**
   - `src/game/engine.ts`
   - `src/game/load-character.ts`
   - `src/routes/index.tsx`
   - `public/env/chars/`
   - `startup.sh`
4. If those files are **missing**, the workspace is empty/detached, or the files do not match this project: **STOP.** Do not invent a replacement. Recover from GitHub (`johr77/Tatersopenworld`) or ask Wes. Start the reply with the all-caps block below.
5. If you *think* a rewrite is required (game “looks incomplete”, “easier to start over”, sandbox looks like a blank TanStack scaffold): **WARN Wes in chat and WAIT.** Do not rebuild until he types an explicit rebuild/start-over in that turn.

Missing/detached warning — exact block, all caps:

⚠️ AGENT/WORKSPACE CHANGED OR FILES MISSING
I cannot see the previous project files.
I will NOT invent a replacement app.
I will NOT continue as if I have the workspace.
Tell me whether to recover the existing Build files, export/show source, or start over.

Never pretend continuity. Never scaffold a different app and call it the same project.
If you are a new agent in this thread, say so in the first sentence.

This is a Grok project. Files under `/workspace/artifacts` persist across conversations — look there (especially `HANDOFF.md`) before concluding there is no project.

Hard rules (also in HANDOFF.md):
- Do not turn auth/DB on.
- M is menu (rebindable), not mute.
- One build piece per click; walls are 3 m.
- Do not spawn trees outside/behind the perimeter wall.
- UBC Superhero bases stay nude until clothes. Do not invent outfits.
- Push to johr77/Tatersopenworld. Keep `CC0files/`. Do not push `node_modules`, `.grok`, `artifacts`, `attachments`, `screenshots`, or sandbox `AGENTS.md`.
