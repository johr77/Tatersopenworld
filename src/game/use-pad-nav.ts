import { useEffect, useRef, useState } from "react";
import { getPadBinds, readPad } from "./pad";

type Opts = {
  count: number;
  cols?: number;
  enabled?: boolean;
  onConfirm?: (index: number) => void;
  onBack?: () => void;
  /** When true, D-pad / confirm are ignored (bind capture). */
  capture?: boolean;
  onAnyButton?: (btn: number) => void;
};

export function usePadNav({
  count,
  cols = 1,
  enabled = true,
  onConfirm,
  onBack,
  capture = false,
  onAnyButton,
}: Opts) {
  const [index, setIndex] = useState(0);
  const [connected, setConnected] = useState(false);
  const indexRef = useRef(0);
  const countRef = useRef(count);
  const colsRef = useRef(cols);
  const cb = useRef({ onConfirm, onBack, onAnyButton, capture });
  indexRef.current = index;
  countRef.current = count;
  colsRef.current = cols;
  cb.current = { onConfirm, onBack, onAnyButton, capture };

  useEffect(() => {
    setIndex((i) => (count <= 0 ? 0 : Math.min(i, count - 1)));
  }, [count]);

  useEffect(() => {
    if (!enabled) return;
    let prev: boolean[] = [];
    let lastStick = 0;
    let raf = 0;
    const tick = () => {
      const { frame, nextPrev } = readPad(prev);
      prev = nextPrev;
      setConnected(frame.connected);
      if (!frame.connected) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const now = performance.now();
      if (cb.current.capture) {
        for (let i = 0; i < 16; i++) {
          if (frame.edge(i)) {
            cb.current.onAnyButton?.(i);
            break;
          }
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      const n = countRef.current;
      const c = Math.max(1, colsRef.current);
      const move = (d: number) => {
        if (n <= 0) return;
        const next = (indexRef.current + d + n * 8) % n;
        indexRef.current = next;
        setIndex(next);
      };
      if (frame.edge(12)) move(-c);
      if (frame.edge(13)) move(c);
      if (frame.edge(14)) move(-1);
      if (frame.edge(15)) move(1);
      const sy = frame.moveY;
      const sx = frame.moveX;
      if (now - lastStick > 220) {
        if (sy > 0.55) {
          move(c);
          lastStick = now;
        } else if (sy < -0.55) {
          move(-c);
          lastStick = now;
        } else if (sx > 0.55) {
          move(1);
          lastStick = now;
        } else if (sx < -0.55) {
          move(-1);
          lastStick = now;
        }
      }
      const binds = getPadBinds();
      if (frame.edge(binds.confirm) || (binds.back !== 9 && frame.edge(9))) {
        cb.current.onConfirm?.(indexRef.current);
      }
      if (frame.edge(binds.back)) cb.current.onBack?.();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return { index, setIndex, connected };
}
