"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { MediaRow } from "@/lib/types";
import { ProgressiveImage } from "@/components/ProgressiveImage";
import { useGridDensity } from "@/hooks/useGridDensity";
import { useNetworkQuality } from "@/hooks/useNetworkQuality";

const GalleryLightbox = dynamic(
  () => import("@/components/GalleryLightbox").then((m) => m.GalleryLightbox),
  { ssr: false },
);

const ALBUM_ORDER = ["all", "wish", "dancing", "portrait", "group", "food", "other", "untagged"] as const;

type AlbumKey = (typeof ALBUM_ORDER)[number];

function albumFor(item: MediaRow): Exclude<AlbumKey, "all"> {
  const tag = item.tag?.toLowerCase().trim();
  if (!tag) return "untagged";
  if (tag === "wish") return "wish";
  if (tag === "dancing" || tag === "portrait" || tag === "group" || tag === "food" || tag === "other") {
    return tag;
  }
  return "other";
}

function objectPosition(item: MediaRow) {
  const x = item.focal_x != null ? Math.round(item.focal_x * 100) : 50;
  const y = item.focal_y != null ? Math.round(item.focal_y * 100) : 50;
  return `${x}% ${y}%`;
}

type Props = {
  initialItems: MediaRow[];
};

export function GalleryClient({ initialItems }: Props) {
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [album, setAlbum] = useState<AlbumKey>("all");
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const { cols, setColumns, levels, containerRef } = useGridDensity({
    levels: [5, 3, 1],
    defaultCols: 3,
  });
  const { preferLowQuality, dataSaver, setDataSaver } = useNetworkQuality();
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel("gallery-media")
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
              return [row, ...without].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              );
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

  const counts = useMemo(() => {
    const map: Record<AlbumKey, number> = {
      all: items.length,
      wish: 0,
      dancing: 0,
      portrait: 0,
      group: 0,
      food: 0,
      other: 0,
      untagged: 0,
    };
    for (const item of items) {
      map[albumFor(item)] += 1;
    }
    return map;
  }, [items]);

  const visible = useMemo(() => {
    if (album === "all") return items;
    return items.filter((item) => albumFor(item) === album);
  }, [items, album]);

  const photos = useMemo(
    () => visible.filter((i) => i.media_type === "photo"),
    [visible],
  );
  const videos = useMemo(
    () => visible.filter((i) => i.media_type === "video"),
    [visible],
  );
  const lightboxItems = useMemo(() => [...photos, ...videos], [photos, videos]);

  // Open from /gallery?id=… deep link (shareable site URL, not R2)
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || lightboxItems.length === 0) return;
    const idx = lightboxItems.findIndex((x) => x.id === id);
    if (idx >= 0) setLightboxIndex(idx);
  }, [searchParams, lightboxItems]);

  /** Avoid router.replace — it remounts the page and breaks lightbox prev/next/share. */
  function syncUrl(nextIndex: number) {
    if (typeof window === "undefined") return;
    const item = nextIndex >= 0 ? lightboxItems[nextIndex] : null;
    const next = item
      ? `/gallery?id=${encodeURIComponent(item.id)}`
      : "/gallery";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === next) return;
    window.history.replaceState(window.history.state, "", next);
  }

  const openAt = (item: MediaRow) => {
    const idx = lightboxItems.findIndex((x) => x.id === item.id);
    if (idx >= 0) {
      setLightboxIndex(idx);
      syncUrl(idx);
    }
  };

  const onIndexChange = (idx: number) => {
    setLightboxIndex(idx);
    syncUrl(idx);
  };

  const onClose = () => {
    setLightboxIndex(-1);
    syncUrl(-1);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-4 flex flex-1 gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {ALBUM_ORDER.map((key) => {
            if (key !== "all" && counts[key] === 0) return null;
            const label =
              key === "all"
                ? "All Photos"
                : key === "wish"
                  ? "Wishes"
                  : key.charAt(0).toUpperCase() + key.slice(1);
            const active = album === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setAlbum(key)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm transition ${
                  active
                    ? "bg-[#c4a574] text-[#1a140c]"
                    : "border border-white/15 bg-white/5 text-white/75 hover:border-white/35"
                }`}
              >
                {label}
                <span className="ml-2 opacity-70">{counts[key]}</span>
              </button>
            );
          })}
        </div>

        <div className="relative flex shrink-0 flex-wrap items-center gap-2">
          <div
            className="flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/5 p-1"
            role="group"
            aria-label="Grid density"
          >
            {levels.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setColumns(n)}
                title={`${n} columns`}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] transition ${
                  cols === n ? "bg-[#c4a574] text-[#1a140c]" : "text-white/60 hover:text-white"
                }`}
              >
                <GridIcon cols={n} />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setViewOptionsOpen((o) => !o)}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              viewOptionsOpen || dataSaver || preferLowQuality
                ? "bg-[#c4a574]/25 text-[#e8d5b5] ring-1 ring-[#c4a574]/50"
                : "border border-white/15 text-white/60 hover:text-white"
            }`}
            aria-expanded={viewOptionsOpen}
            aria-haspopup="true"
            title="View options"
          >
            View
          </button>
          {viewOptionsOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 min-w-[12rem] rounded-xl border border-white/15 bg-[#14161c] p-2 shadow-xl">
              <button
                type="button"
                onClick={() => setDataSaver(!dataSaver)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/85 hover:bg-white/5"
                title="Use smaller images on slow connections"
              >
                <span>Data saver</span>
                <span className="text-xs text-white/50">
                  {dataSaver || preferLowQuality ? "On" : "Off"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {photos.length === 0 && videos.length === 0 ? (
        <p className="py-20 text-center text-white/45">No photos in this album yet.</p>
      ) : (
        <>
          {photos.length > 0 && (
            <div
              ref={containerRef}
              className="grid gap-1 touch-pan-y md:gap-1.5"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {photos.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="group relative aspect-square overflow-hidden bg-black/40"
                  onClick={() => openAt(item)}
                >
                  <ProgressiveImage
                    thumbSrc={item.thumb_url}
                    previewSrc={
                      preferLowQuality
                        ? item.thumb_url || item.preview_url
                        : item.preview_url
                    }
                    fullSrc={item.url}
                    alt={item.caption || ""}
                    className="h-full w-full transition duration-500 group-hover:scale-[1.03]"
                    objectPosition={objectPosition(item)}
                    fit="cover"
                  />
                </button>
              ))}
            </div>
          )}

          {videos.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm uppercase tracking-[0.2em] text-white/45">Videos</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {videos.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="overflow-hidden rounded-lg border border-white/10 bg-black/40"
                    onClick={() => openAt(item)}
                  >
                    <video src={item.url} className="aspect-video w-full object-cover" muted playsInline />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <GalleryLightbox
        items={lightboxItems}
        index={Math.max(0, lightboxIndex)}
        open={lightboxIndex >= 0}
        onClose={onClose}
        onIndexChange={onIndexChange}
        preferLowQuality={preferLowQuality}
      />
    </div>
  );
}

function GridIcon({ cols }: { cols: number }) {
  const n = Math.min(cols, 5);
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      {Array.from({ length: n * n }).map((_, i) => {
        const row = Math.floor(i / n);
        const col = i % n;
        const size = 14 / n - 0.8;
        const gap = 0.8;
        return (
          <rect
            key={i}
            x={1 + col * (size + gap)}
            y={1 + row * (size + gap)}
            width={size}
            height={size}
            rx={0.4}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}
