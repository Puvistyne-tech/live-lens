"use client";

import { useEffect, useMemo, useState } from "react";
import { getVideoDurationMs, trimVideoFile } from "@/lib/media-preprocess";

type Props = {
  file: File;
  maxSeconds: number;
  maxBytes: number;
  onCancel: () => void;
  onDone: (result: { file: File; durationMs: number }) => void;
};

function formatSec(ms: number) {
  const s = Math.max(0, ms / 1000);
  return s < 10 ? s.toFixed(1) : String(Math.round(s));
}

export function VideoTrimSheet({ file, maxSeconds, maxBytes, onCancel, onDone }: Props) {
  const [durationMs, setDurationMs] = useState(0);
  const [startMs, setStartMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);

  const maxMs = Math.max(1, maxSeconds) * 1000;
  const windowMs = Math.min(maxMs, durationMs || maxMs);
  const maxStart = Math.max(0, (durationMs || 0) - windowMs);
  const endMs = startMs + windowMs;

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ms = await getVideoDurationMs(file);
        if (cancelled) return;
        setDurationMs(ms);
        setStartMs(0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not read video");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  async function applyTrim(nextStart: number) {
    setBusy(true);
    setError(null);
    try {
      const result = await trimVideoFile(file, {
        startMs: nextStart,
        maxSeconds,
        maxBytes,
      });
      onDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not trim video");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-trim-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-[#141820] text-[#f2f0ea] shadow-xl">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 id="video-trim-title" className="text-base font-medium">
            Trim video
          </h2>
          <p className="mt-1 text-sm text-white/50">
            Videos can be up to {maxSeconds}s. Choose which part to keep.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="overflow-hidden rounded-xl bg-black">
            <video
              src={previewUrl}
              className="aspect-video w-full object-contain"
              controls
              playsInline
              muted
            />
          </div>

          {durationMs > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/80 disabled:opacity-40"
                  disabled={busy}
                  onClick={() => setStartMs(0)}
                >
                  Start
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/80 disabled:opacity-40"
                  disabled={busy || maxStart <= 0}
                  onClick={() => setStartMs(Math.round(maxStart / 2))}
                >
                  Middle
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/80 disabled:opacity-40"
                  disabled={busy || maxStart <= 0}
                  onClick={() => setStartMs(maxStart)}
                >
                  End
                </button>
              </div>

              <label className="block text-sm text-white/70">
                Keep {formatSec(windowMs)}s from {formatSec(startMs)}s → {formatSec(endMs)}s
                <input
                  type="range"
                  className="mt-2 w-full accent-[#c4a574]"
                  min={0}
                  max={maxStart}
                  step={100}
                  value={Math.min(startMs, maxStart)}
                  disabled={busy || maxStart <= 0}
                  onChange={(e) => setStartMs(Number(e.target.value))}
                />
              </label>
            </>
          )}

          {error && <p className="text-sm text-[#d77a6d]">{error}</p>}
          {busy && <p className="text-sm text-[#e8d5b5]">Trimming video…</p>}
        </div>

        <div className="flex gap-2 border-t border-white/10 p-3">
          <button
            type="button"
            className="flex-1 rounded-xl px-4 py-3 text-sm text-white/60 hover:bg-white/8"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl bg-[#c4a574] px-4 py-3 text-sm text-[#1a140c] disabled:opacity-50"
            disabled={busy || !durationMs}
            onClick={() => void applyTrim(startMs)}
          >
            {busy ? "Working…" : "Use this clip"}
          </button>
        </div>
      </div>
    </div>
  );
}
