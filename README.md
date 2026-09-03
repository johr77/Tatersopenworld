# Tater's Open World

Chop wood, build a camp, survive. Browser FPS / third-person lumberjack camp.

CC0 environment assets live in [`CC0files/`](./CC0files) (Quaternius Universal Base Characters, KayKit tools, Kenney kits, nature, sounds).

## Run

```bash
npm install
npm run dev
```

Dev server: `http://localhost:8080`

Local-only for now (no account / no database). Players and inventory stay in the browser.

## Note

The playable game source (`src/game`, routes, Kenney/Quaternius runtime assets) was lost in a Grok App Builder sandbox reset. This commit backs up the current workspace scaffold plus the existing `CC0files/` tree. Gameplay will be rebuilt on top of those assets.
