"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "livelens-gallery-cols";
const DEFAULT_LEVELS = [5, 3, 1] as const;

type Options = {
  levels?: readonly number[];
  defaultCols?: number;
  pinchThreshold?: number;
};

function readStored(levels: readonly number[], fallback: number) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    if (levels.includes(n)) return n;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * Apple Photos–style grid density: pinch on touch + setColumns for desktop buttons.
 * Levels are column counts (e.g. 5 → 3 → 1). Pinch-in (spread) → fewer columns.
 */
export function useGridDensity(options: Options = {}) {
  const levels = options.levels ?? DEFAULT_LEVELS;
  const defaultCols = options.defaultCols ?? 3;
  const threshold = options.pinchThreshold ?? 0.3;

  const [cols, setColsState] = useState(defaultCols);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const colsRef = useRef(cols);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartCols = useRef(cols);
  const switched = useRef(false);

  useEffect(() => {
    setColsState(readStored(levels, defaultCols));
  }, [levels, defaultCols]);

  useEffect(() => {
    colsRef.current = cols;
  }, [cols]);

  const setColumns = useCallback(
    (next: number) => {
      if (!levels.includes(next)) return;
      const el = containerRef.current;
      const children = el ? Array.from(el.children) as HTMLElement[] : [];

      // Scroll anchor: tile nearest upper third of viewport
      let anchor: HTMLElement | null = null;
      let anchorOffset = 0;
      if (el && children.length) {
        const targetY = window.scrollY + window.innerHeight * 0.33;
        let best = Infinity;
        for (const child of children) {
          const rect = child.getBoundingClientRect();
          const mid = window.scrollY + rect.top + rect.height / 2;
          const dist = Math.abs(mid - targetY);
          if (dist < best) {
            best = dist;
            anchor = child;
            anchorOffset = mid - window.scrollY;
          }
        }
      }

      // FLIP snapshot
      const first = new Map<HTMLElement, DOMRect>();
      for (const child of children) first.set(child, child.getBoundingClientRect());

      setColsState(next);
      colsRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }

      requestAnimationFrame(() => {
        for (const child of children) {
          const a = first.get(child);
          if (!a) continue;
          const b = child.getBoundingClientRect();
          const dx = a.left - b.left;
          const dy = a.top - b.top;
          const sx = a.width / (b.width || 1);
          const sy = a.height / (b.height || 1);
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01) continue;
          child.animate(
            [
              { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
              { transform: "translate(0, 0) scale(1, 1)" },
            ],
            { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
          );
        }
        if (anchor) {
          const rect = anchor.getBoundingClientRect();
          const mid = window.scrollY + rect.top + rect.height / 2;
          window.scrollTo({ top: mid - anchorOffset, behavior: "instant" as ScrollBehavior });
        }
      });
    },
    [levels],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const dist = (t: TouchList) => {
      if (t.length < 2) return 0;
      const a = t[0];
      const b = t[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinchStartDist.current = dist(e.touches);
      pinchStartCols.current = colsRef.current;
      switched.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinchStartDist.current == null || switched.current) return;
      const d = dist(e.touches);
      if (!pinchStartDist.current) return;
      const ratio = d / pinchStartDist.current;
      const idx = levels.indexOf(pinchStartCols.current);
      if (idx < 0) return;

      // Pinch out (fingers apart) → zoom in → fewer columns
      if (ratio >= 1 + threshold && idx < levels.length - 1) {
        e.preventDefault();
        switched.current = true;
        setColumns(levels[idx + 1]);
      } else if (ratio <= 1 - threshold && idx > 0) {
        e.preventDefault();
        switched.current = true;
        setColumns(levels[idx - 1]);
      }
    };

    const onEnd = () => {
      pinchStartDist.current = null;
      switched.current = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [levels, threshold, setColumns]);

  return { cols, setColumns, levels, containerRef };
}
