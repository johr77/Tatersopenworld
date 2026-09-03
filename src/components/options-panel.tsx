import { useState } from "react";
import { BIND_LABELS, loadBinds, saveBinds } from "@/game/bindings";
import { DEFAULT_BINDS, type BindAction, type Bindings } from "@/game/types";

export function OptionsPanel({ onClose }: { onClose: () => void }) {
  const [binds, setBinds] = useState<Bindings>(() => loadBinds());
  const [listen, setListen] = useState<BindAction | null>(null);

  function capture(action: BindAction) {
    setListen(action);
    const once = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setListen(null);
        window.removeEventListener("keydown", once, true);
        return;
      }
      const next = { ...binds, [action]: e.code };
      setBinds(next);
      saveBinds(next);
      setListen(null);
      window.removeEventListener("keydown", once, true);
    };
    window.addEventListener("keydown", once, true);
  }

  function reset() {
    setBinds({ ...DEFAULT_BINDS });
    saveBinds({ ...DEFAULT_BINDS });
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface p-6 ring-1 ring-line">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-2xl tracking-tight">Controls</p>
          <p className="text-sm text-muted">Click a row, then press a key. Menu defaults to M.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm px-3 py-2 text-sm text-muted ring-1 ring-line hover:text-fg"
        >
          Close
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {(Object.keys(BIND_LABELS) as BindAction[]).map((action) => (
          <li key={action}>
            <button
              type="button"
              onClick={() => capture(action)}
              className="flex w-full items-center justify-between rounded-md bg-raised px-3 py-3 text-left hover:ring-1 hover:ring-accent"
            >
              <span className="text-sm">{BIND_LABELS[action]}</span>
              <span className="font-mono text-xs text-accent">
                {listen === action ? "Press key…" : binds[action].replace(/^Key/, "")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-subtle">Mouse look · Left click use · Wheel cycles tools or build parts</p>
      <button type="button" onClick={reset} className="self-start text-sm text-muted underline">
        Reset defaults
      </button>
    </div>
  );
}
