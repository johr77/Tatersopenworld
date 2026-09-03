import { useEffect, useMemo, useState } from "react";
import { Axe, Play, Plus, Trash2, Trees } from "lucide-react";
import { CHARACTERS, hairLabel } from "@/game/characters";
import { createPlayer, deletePlayer, listPlayers } from "@/game/players";
import { usePadNav } from "@/game/use-pad-nav";
import { CharacterPreview } from "./character-preview";
import { OptionsPanel } from "./options-panel";
import type { PlayerRecord } from "@/game/types";

function focusRing(on: boolean) {
  return on ? " ring-2 ring-accent" : "";
}

export function TitleScreen({ onEnter }: { onEnter: () => void }) {
  const { connected } = usePadNav({
    count: 1,
    onConfirm: () => onEnter(),
  });

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#2a2822,_#12110e_62%)]" />
      <div className="relative flex max-w-lg flex-col items-center text-center">
        <p className="text-xs tracking-[0.28em] text-muted uppercase">Camp · Chop · Build</p>
        <h1 className="mt-3 font-display text-6xl leading-none tracking-tight text-fg sm:text-7xl">
          Tater's
        </h1>
        <p className="mt-2 font-display text-xl text-accent">Open World</p>
        <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
          Cut a clearing, raise walls, and keep the fire going. A lumberjack camp in the pines.
        </p>
        <button
          type="button"
          autoFocus
          onClick={onEnter}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter();
          }}
          className="mt-10 rounded-md bg-accent px-8 py-3 font-medium text-accent-fg hover:opacity-90 ring-2 ring-accent"
        >
          Enter
        </button>
        <p className="mt-4 text-xs text-subtle">
          {connected ? "A / Menu · Enter" : "Press a controller button, or Enter"}
        </p>
      </div>
    </main>
  );
}

export function SelectScreen({
  onCreate,
  onPlay,
}: {
  onCreate: () => void;
  onPlay: (p: PlayerRecord) => void;
}) {
  const [tick, setTick] = useState(0);
  const players = useMemo(() => listPlayers(), [tick]);
  const count = 1 + players.length;
  const { index, connected } = usePadNav({
    count,
    cols: 1,
    onConfirm: (i) => {
      if (i <= 0) onCreate();
      else if (players[i - 1]) onPlay(players[i - 1]!);
    },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-5 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.22em] text-muted uppercase">Roster</p>
          <h1 className="font-display text-4xl tracking-tight">Who's heading out?</h1>
          <p className="mt-1 text-xs text-subtle">
            {connected ? "D-pad / stick move · A select · New is first" : "Plug in a pad and press a button"}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className={
            "inline-flex items-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-fg" +
            focusRing(index === 0)
          }
        >
          <Plus className="size-4" strokeWidth={2} />
          New
        </button>
      </header>
      {players.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-surface px-6 py-16 text-center ring-1 ring-line">
          <Trees className="size-8 text-muted" strokeWidth={1.5} />
          <p className="mt-4 font-display text-2xl">No campers yet</p>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Make a lumberjack. Clothes come later — pick a body and a cut for now.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {players.map((p, i) => (
            <li
              key={p.id}
              className={
                "flex items-center justify-between gap-3 rounded-lg bg-surface p-4 ring-1 ring-line" +
                focusRing(index === i + 1)
              }
            >
              <button type="button" onClick={() => onPlay(p)} className="flex-1 text-left">
                <p className="font-display text-xl">{p.name}</p>
                <p className="text-xs text-muted">
                  {CHARACTERS.find((c) => c.id === p.charId)?.label ?? p.charId}
                </p>
              </button>
              <button
                type="button"
                aria-label={`Delete ${p.name}`}
                onClick={() => {
                  if (confirm(`Delete ${p.name}? This clears their camp.`)) {
                    deletePlayer(p.id);
                    setTick((n) => n + 1);
                  }
                }}
                className="rounded-sm p-2 text-muted hover:bg-raised hover:text-danger"
              >
                <Trash2 className="size-4" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function CreateScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (p: PlayerRecord) => void;
}) {
  const [name, setName] = useState("");
  const [charId, setCharId] = useState(CHARACTERS[0]!.id);
  const picked = CHARACTERS.find((c) => c.id === charId)!;
  const nChar = CHARACTERS.length;

  function submit() {
    const rec = createPlayer(name || picked.label, charId);
    onCreated(rec);
  }

  const { index, setIndex, connected } = usePadNav({
    count: 2 + nChar,
    cols: 4,
    onConfirm: (i) => {
      if (i === 0) onBack();
      else if (i >= 1 && i <= nChar) {
        setCharId(CHARACTERS[i - 1]!.id);
      } else submit();
    },
    onBack,
  });

  useEffect(() => {
    setIndex(1);
  }, [setIndex]);

  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[1fr_280px]">
      <section>
        <button
          type="button"
          onClick={onBack}
          className={"text-sm text-muted hover:text-fg" + (index === 0 ? " text-fg underline" : "")}
        >
          Back
        </button>
        <h1 className="mt-3 font-display text-4xl tracking-tight">New lumberjack</h1>
        <p className="mt-2 text-sm text-muted">
          Bodies from Universal Base Characters. Clothes later.
          {connected ? " D-pad pick a look · A on Create." : ""}
        </p>
        <label className="mt-6 block text-xs text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder={picked.label}
            className="mt-1 w-full rounded-md bg-surface px-3 py-3 text-fg outline-none ring-1 ring-line focus:ring-accent"
          />
        </label>
        <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHARACTERS.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setCharId(c.id);
                  setIndex(i + 1);
                }}
                className={
                  "w-full rounded-md px-3 py-3 text-left ring-1 " +
                  (c.id === charId ? "bg-raised ring-accent" : "bg-surface ring-line") +
                  focusRing(index === i + 1)
                }
              >
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted">
                  {c.body} · {hairLabel(c)}
                </p>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={submit}
          className={
            "mt-8 rounded-md bg-accent px-6 py-3 font-medium text-accent-fg" +
            focusRing(index === nChar + 1)
          }
        >
          Create
        </button>
      </section>
      <aside className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
        <div className="h-80 w-full lg:h-full">
          <CharacterPreview key={charId} charId={charId} />
        </div>
      </aside>
    </main>
  );
}

export function HubScreen({
  player,
  onPlay,
  onBack,
}: {
  player: PlayerRecord;
  onPlay: () => void;
  onBack: () => void;
}) {
  const [opts, setOpts] = useState(false);
  const look = CHARACTERS.find((c) => c.id === player.charId);
  const { index, connected } = usePadNav({
    count: 3,
    enabled: !opts,
    onConfirm: (i) => {
      if (i === 0) onPlay();
      else if (i === 1) setOpts(true);
      else onBack();
    },
    onBack: onBack,
  });

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#24211c,_#12110e_70%)]" />
      <div className="relative flex w-full max-w-lg flex-col items-center text-center">
        <div className="mb-6 h-56 w-full max-w-xs overflow-hidden rounded-xl bg-surface ring-1 ring-line">
          <CharacterPreview charId={player.charId} />
        </div>
        <p className="text-xs tracking-[0.22em] text-muted uppercase">Camp hub</p>
        <h1 className="mt-1 font-display text-4xl">{player.name}</h1>
        <p className="text-sm text-muted">{look?.label}</p>
        <p className="mt-2 text-xs text-subtle">
          {connected ? "D-pad · A select · B switch player" : "A Play once the pad wakes"}
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            onClick={onPlay}
            className={
              "inline-flex items-center justify-center gap-2 rounded-md bg-accent px-6 py-3 font-medium text-accent-fg" +
              focusRing(index === 0 && !opts)
            }
          >
            <Play className="size-4" strokeWidth={2} />
            Play
          </button>
          <button
            type="button"
            onClick={() => setOpts(true)}
            className={
              "rounded-md px-6 py-3 text-sm ring-1 ring-line hover:bg-surface" +
              focusRing(index === 1 && !opts)
            }
          >
            Options
          </button>
          <button
            type="button"
            onClick={onBack}
            className={
              "py-3 text-sm text-muted hover:text-fg" + focusRing(index === 2 && !opts)
            }
          >
            Switch player
          </button>
        </div>
      </div>
      {opts ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-bg/70 p-4">
          <OptionsPanel onClose={() => setOpts(false)} />
        </div>
      ) : null}
    </main>
  );
}

export function BrandMark() {
  return <Axe className="size-4" strokeWidth={2} />;
}
