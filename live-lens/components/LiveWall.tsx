"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SiteQr } from "@/components/SiteQr";
import { preloadLiveMedia } from "@/lib/media-preload";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { EventSettings, MediaRow } from "@/lib/types";

const DepthParallax = dynamic(
  () => import("@/components/DepthParallax").then((m) => m.DepthParallax),
  { ssr: false },
);

const HOLD_MS = 7000;
const KEN_BURNS_MS = 6500;
const SWAP_EASE = [0.22, 1, 0.36, 1] as const;
const KEN_BURNS_SCALE = 1.08;
const KEN_BURNS_PAN_PCT = 3.5;

type Props = {
  initialItems: MediaRow[];
  settings: EventSettings | null;
};

function objectPosition(item: MediaRow) {
  const x = item.focal_x != null ? Math.round(item.focal_x * 100) : 50;
  const y = item.focal_y != null ? Math.round(item.focal_y * 100) : 50;
  return `${x}% ${y}%`;
}

/** Deterministic 0–1 from id so null-focal pans don’t jump on remount. */
function hashUnit(id: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 999;
}

function kenBurnsTarget(item: MediaRow): { scale: number; x: string; y: string } {
  const fx = item.focal_x ?? 0.35 + hashUnit(item.id, 7) * 0.3;
  const fy = item.focal_y ?? 0.35 + hashUnit(item.id, 13) * 0.3;
  // Pan opposite the focal offset so the subject drifts toward frame center.
  const x = Math.max(-KEN_BURNS_PAN_PCT, Math.min(KEN_BURNS_PAN_PCT, (0.5 - fx) * KEN_BURNS_PAN_PCT * 2));
  const y = Math.max(-KEN_BURNS_PAN_PCT, Math.min(KEN_BURNS_PAN_PCT, (0.5 - fy) * KEN_BURNS_PAN_PCT * 2));
  return { scale: KEN_BURNS_SCALE, x: `${x}%`, y: `${y}%` };
}

function KenBurnsFrame({
  item,
  reducedMotion,
  children,
}: {
  item: MediaRow;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const target = kenBurnsTarget(item);

  if (reducedMotion) {
    return <div className="flex h-full w-full items-center justify-center">{children}</div>;
  }

  return (
    <motion.div
      key={item.id}
      className="flex h-full w-full items-center justify-center will-change-transform"
      initial={{ scale: 1, x: "0%", y: "0%" }}
      animate={{ scale: target.scale, x: target.x, y: target.y }}
      transition={{ duration: KEN_BURNS_MS / 1000, ease: "linear" }}
    >
      {children}
    </motion.div>
  );
}

export function LiveWall({ initialItems, settings }: Props) {
  const [items, setItems] = useState(initialItems);
  const [index, setIndex] = useState(0);
  const [liveSettings, setLiveSettings] = useState(settings);
  const [muted, setMuted] = useState(!(settings?.live_video_sound ?? false));
  const reducedMotion = useReducedMotion() ?? false;

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (
        item.media_type === "video" &&
        liveSettings &&
        !liveSettings.live_include_guest_video &&
        item.source === "guest"
      ) {
        return false;
      }
      return true;
    });
  }, [items, liveSettings]);


  const current = visible[index % Math.max(visible.length, 1)];
  
  const couple = liveSettings?.couple_names?.trim();
  const isWish = current?.tag?.toLowerCase() === "wish";
  const uploaderLabel = (() => {
    const raw = current?.uploader_name?.trim();
    if (!raw) return null;
    if (/^(guest|staff)$/i.test(raw)) return null;
    return raw;
  })();
  const showOverlay = Boolean(current?.caption?.trim() || uploaderLabel || isWish);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel("live-media")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "media" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as MediaRow;
            if (row.approved) setItems((prev) => [row, ...prev.filter((p) => p.id !== row.id)]);
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as MediaRow;
            setItems((prev) => {
              if (!row.approved) return prev.filter((p) => p.id !== row.id);
              const without = prev.filter((p) => p.id !== row.id);
              return [row, ...without];
            });
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as MediaRow;
            setItems((prev) => prev.filter((p) => p.id !== row.id));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_settings" },
        (payload) => {
          const row = payload.new as EventSettings;
          setLiveSettings(row);
          setMuted(!(row.live_video_sound ?? false));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (visible.length <= 1) return;
    const id = setInterval(() => setIndex((i) => i + 1), HOLD_MS);
    return () => clearInterval(id);
  }, [visible.length]);

  useEffect(() => {
    if (!visible.length) return;
    preloadLiveMedia(visible, index % visible.length);
  }, [visible, index]);

  const swapTransition = reducedMotion
    ? { duration: 0.4, ease: SWAP_EASE }
    : { duration: 0.85, ease: SWAP_EASE };

  const slideInitial = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, filter: "blur(12px)" };
  const slideAnimate = reducedMotion
    ? { opacity: 1 }
    : { opacity: 1, filter: "blur(0px)" };
  const slideExit = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, filter: "blur(10px)" };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0b0c10] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,#2a2430_0%,transparent_40%),radial-gradient(circle_at_90%_0%,#1a2430_0%,transparent_35%)]" />
      <AnimatePresence mode="wait">
        {current ? (
          <motion.div
            key={current.id}
            className="absolute inset-0 overflow-hidden"
            initial={slideInitial}
            animate={slideAnimate}
            exit={slideExit}
            transition={swapTransition}
          >
            <div className="flex h-full w-full items-center justify-center p-3 sm:p-6">
              {current.media_type === "video" ? (
                <video
                  key={current.url}
                  src={current.url}
                  className="max-h-full max-w-full object-contain"
                  style={{ objectPosition: objectPosition(current) }}
                  autoPlay
                  muted={muted}
                  playsInline
                  loop
                />
              ) : current.depth_map_url ? (
                <KenBurnsFrame item={current} reducedMotion={reducedMotion}>
                  <div className="h-full w-full max-w-[1600px]">
                    <DepthParallax imageUrl={current.url} depthMapUrl={current.depth_map_url} />
                  </div>
                </KenBurnsFrame>
              ) : (
                <KenBurnsFrame item={current} reducedMotion={reducedMotion}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={current.url}
                    alt={current.caption || ""}
                    className="max-h-full max-w-full object-cover shadow-2xl sm:object-contain"
                    style={{ objectPosition: objectPosition(current) }}
                  />
                </KenBurnsFrame>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.p
            key="empty"
            className="absolute inset-0 flex items-center justify-center text-white/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Waiting for the first photo…
          </motion.p>
        )}
      </AnimatePresence>

      {showOverlay && current && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-6 sm:bottom-28">
          <div className="max-w-3xl rounded-2xl bg-black/45 px-5 py-4 text-center backdrop-blur-sm">
            {isWish && (
              <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[#c4a574]">Wish</p>
            )}
            {current.caption?.trim() && (
              <p className="font-display text-xl text-white/95 drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)] sm:text-2xl md:text-3xl">
                {current.caption.trim()}
              </p>
            )}
            {uploaderLabel && (
              <p className="mt-2 text-sm text-white/70 sm:text-base">— {uploaderLabel}</p>
            )}
          </div>
        </div>
      )}

      {current?.media_type === "video" && (
        <button
          type="button"
          className="absolute right-4 top-4 z-30 rounded-full border border-white/25 bg-black/50 px-4 py-2 text-sm text-white/90 backdrop-blur hover:bg-black/70 sm:right-6 sm:top-6"
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
      )}

      <div className="absolute bottom-4 left-4 z-20 flex items-end gap-3 text-xs text-white/50 sm:text-sm">
        <Link href="/" className="hover:text-white/80">
          {couple || "LiveLens"}
        </Link>
        <span>·</span>
        <span>{visible.length} live</span>
      </div>

      <div className="absolute bottom-4 right-4 z-20 sm:bottom-6 sm:right-6">
        <SiteQr size={112} label="Join & upload" />
      </div>
    </div>
  );
}
