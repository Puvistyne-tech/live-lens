"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { SiteQr } from "@/components/SiteQr";
import { preloadLiveMedia } from "@/lib/media-preload";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { EventSettings, MediaRow } from "@/lib/types";

const DepthParallax = dynamic(
  () => import("@/components/DepthParallax").then((m) => m.DepthParallax),
  { ssr: false },
);

type Props = {
  initialItems: MediaRow[];
  settings: EventSettings | null;
};

function objectPosition(item: MediaRow) {
  const x = item.focal_x != null ? Math.round(item.focal_x * 100) : 50;
  const y = item.focal_y != null ? Math.round(item.focal_y * 100) : 50;
  return `${x}% ${y}%`;
}

export function LiveWall({ initialItems, settings }: Props) {
  const [items, setItems] = useState(initialItems);
  const [index, setIndex] = useState(0);

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (item.tag?.toLowerCase() === "wish") return false;
      if (item.media_type === "video" && settings && !settings.live_include_guest_video && item.source === "guest") {
        return false;
      }
      return true;
    });
  }, [items, settings]);

  const current = visible[index % Math.max(visible.length, 1)];
  const couple = settings?.couple_names?.trim();

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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (visible.length <= 1) return;
    const id = setInterval(() => setIndex((i) => i + 1), 7000);
    return () => clearInterval(id);
  }, [visible.length]);

  useEffect(() => {
    if (!visible.length) return;
    preloadLiveMedia(visible, index % visible.length);
  }, [visible, index]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0b0c10] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,#2a2430_0%,transparent_40%),radial-gradient(circle_at_90%_0%,#1a2430_0%,transparent_35%)]" />
      <AnimatePresence mode="wait">
        {current ? (
          <motion.div
            key={current.id}
            className="absolute inset-0 flex items-center justify-center p-3 sm:p-6"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {current.media_type === "video" ? (
              <video
                key={current.url}
                src={current.url}
                className="max-h-full max-w-full object-contain"
                style={{ objectPosition: objectPosition(current) }}
                autoPlay
                muted
                playsInline
                loop
              />
            ) : current.depth_map_url ? (
              <div className="h-full w-full max-w-[1600px]">
                <DepthParallax imageUrl={current.url} depthMapUrl={current.depth_map_url} />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.url}
                alt={current.caption || ""}
                className="max-h-full max-w-full object-cover shadow-2xl sm:object-contain"
                style={{ objectPosition: objectPosition(current) }}
              />
            )}
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

      {current?.caption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-6 sm:bottom-20">
          <p className="max-w-3xl text-center font-[family-name:var(--font-display)] text-xl text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)] sm:text-2xl md:text-3xl">
            {current.caption}
          </p>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-20 flex items-end gap-3 text-xs text-white/50 sm:text-sm">
        <a href="/" className="hover:text-white/80">
          {couple || "LiveLens"}
        </a>
        <span>·</span>
        <span>{visible.length} live</span>
      </div>

      <div className="absolute bottom-4 right-4 z-20 sm:bottom-6 sm:right-6">
        <SiteQr size={112} label="Join & upload" />
      </div>
    </div>
  );
}
