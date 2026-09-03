import { useState } from "react";
import { BIND_LABELS, loadBinds, saveBinds } from "@/game/bindings";
import {
  getPadBinds,
  loadPadBinds,
  padBtnName,
  PAD_BIND_LABELS,
  savePadBinds,
} from "@/game/pad";
import { usePadNav } from "@/game/use-pad-nav";
import {
  DEFAULT_BINDS,
  DEFAULT_PAD_BINDS,
  type BindAction,
  type Bindings,
  type PadAction,
  type PadBindings,
} from "@/game/types";

const KEY_ACTIONS = Object.keys(BIND_LABELS) as BindAction[];
const PAD_ACTIONS = Object.keys(PAD_BIND_LABELS) as PadAction[];

export function OptionsPanel({ onClose }: { onClose: () => void }) {
  const [binds, setBinds] = useState<Bindings>(() => loadBinds());
  const [pad, setPad] = useState<PadBindings>(() => loadPadBinds());
  const [listenKey, setListenKey] = useState<BindAction | null>(null);
  const [listenPad, setListenPad] = useState<PadAction | null>(null);

  const keyRows = KEY_ACTIONS.length;
  const padRows = PAD_ACTIONS.length;
  const extra = 2;
  const total = keyRows + padRows + extra;

  const { index, connected } = usePadNav({
    count: total,
    enabled: true,
    capture: !!listenPad,
    onAnyButton: (btn) => {
      if (!listenPad) return;
      const next = { ...getPadBinds(), [listenPad]: btn };
      setPad(next);
      savePadBinds(next);
      setListenPad(null);
    },
    onConfirm: (i) => {
      if (i < keyRows) {
        captureKey(KEY_ACTIONS[i]!);
        return;
      }
      const p = i - keyRows;
      if (p < padRows) {
        setListenKey(null);
        setListenPad(PAD_ACTIONS[p]!);
        return;
      }
      if (p === padRows) reset();
      else onClose();
    },
    onBack: () => {
      if (listenPad || listenKey) {
        setListenPad(null);
        setListenKey(null);
        return;
      }
      onClose();
    },
  });

  function captureKey(action: BindAction) {
    setListenPad(null);
    setListenKey(action);
    const once = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setListenKey(null);
        window.removeEventListener("keydown", once, true);
        return;
      }
      const next = { ...binds, [action]: e.code };
      setBinds(next);
      saveBinds(next);
      setListenKey(null);
      window.removeEventListener("keydown", once, true);
    };
    window.addEventListener("keydown", once, true);
  }

  function reset() {
    setBinds({ ...DEFAULT_BINDS });
    saveBinds({ ...DEFAULT_BINDS });
    setPad({ ...DEFAULT_PAD_BINDS });
    savePadBinds({ ...DEFAULT_PAD_BINDS });
    setListenKey(null);
    setListenPad(null);
  }

  function rowClass(i: number) {
    return (
      "flex w-full items-center justify-between rounded-md bg-raised px-3 py-3 text-left hover:ring-1 hover:ring-accent " +
      (index === i ? "ring-1 ring-accent" : "")
    );
  }

  return (
    <div className="flex max-h-[min(88dvh,40rem)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl bg-surface p-6 ring-1 ring-line">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-2xl tracking-tight">Controls</p>
          <p className="text-sm text-muted">
            Highlight a row, press A, then the key or controller button.
            {connected ? " Pad connected." : " Press a pad button to wake it."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={
            "rounded-sm px-3 py-2 text-sm text-muted ring-1 ring-line hover:text-fg " +
            (index === total - 1 ? "ring-accent text-fg" : "")
          }
        >
          Close
        </button>
      </div>

      <p className="text-xs tracking-[0.18em] text-muted uppercase">Keyboard</p>
      <ul className="flex flex-col gap-1">
        {KEY_ACTIONS.map((action, i) => (
          <li key={action}>
            <button type="button" onClick={() => captureKey(action)} className={rowClass(i)}>
              <span className="text-sm">{BIND_LABELS[action]}</span>
              <span className="font-mono text-xs text-accent">
                {listenKey === action ? "Press key…" : binds[action].replace(/^Key/, "")}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-xs tracking-[0.18em] text-muted uppercase">Controller</p>
      <p className="text-xs text-subtle">Left stick move · Right stick look (not remapped).</p>
      <ul className="flex flex-col gap-1">
        {PAD_ACTIONS.map((action, i) => (
          <li key={action}>
            <button
              type="button"
              onClick={() => {
                setListenKey(null);
                setListenPad(action);
              }}
              className={rowClass(keyRows + i)}
            >
              <span className="text-sm">{PAD_BIND_LABELS[action]}</span>
              <span className="font-mono text-xs text-accent">
                {listenPad === action ? "Press button…" : padBtnName(pad[action])}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={reset}
        className={
          "self-start text-sm text-muted underline " +
          (index === keyRows + padRows ? "text-fg" : "")
        }
      >
        Reset keyboard + pad defaults
      </button>
    </div>
  );
}
