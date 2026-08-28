import type { MediaRow } from "@/lib/types";

const PRELOAD_WINDOW = 5;

/** Keeps Image / video elements alive so the browser can reuse decoded bytes. */
const imageCache = new Map<string, HTMLImageElement>();
const videoCache = new Map<string, HTMLVideoElement>();

function preloadImage(url: string) {
  if (!url || imageCache.has(url)) return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  imageCache.set(url, img);
}

function preloadVideo(url: string) {
  if (!url || typeof document === "undefined" || videoCache.has(url)) return;
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  videoCache.set(url, video);
}

/** Warm current + next N slides (photos, depth maps, videos). Caps at PRELOAD_WINDOW. */
export function preloadLiveMedia(items: MediaRow[], startIndex: number) {
  if (!items.length) return;
  const n = Math.min(PRELOAD_WINDOW, items.length);
  for (let i = 0; i < n; i++) {
    const item = items[(startIndex + i) % items.length];
    if (!item?.url) continue;
    if (item.media_type === "video") {
      preloadVideo(item.url);
    } else {
      preloadImage(item.url);
      if (item.depth_map_url) preloadImage(item.depth_map_url);
    }
  }
}
