REPLACE these files in your repo (overwrite):

  src/game/types.ts  (1401 bytes)
  src/game/pad.ts  (3100 bytes)
  src/game/use-pad-nav.ts  (2879 bytes)
  src/game/engine.ts  (31045 bytes)
  src/components/options-panel.tsx  (5393 bytes)
  src/components/player-screens.tsx  (10861 bytes)
  src/components/game-screen.tsx  (9944 bytes)

NEW file:
  src/game/use-pad-nav.ts

Then npm run dev

Title: A or Menu = Enter
Roster: D-pad/stick highlight · A select · first slot is New
Create: D-pad looks · A highlight look · A on Create · B back
Hub: D-pad Play / Options / Switch · A · B switch player
Options: A on a Controller row, then press the pad button
Pause: D-pad Resume / Options / Quit
LS move and RS look stay fixed.
