"use client";

import { useEffect, useMemo, useState } from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import Download from "yet-another-react-lightbox/plugins/download";
import Video from "yet-another-react-lightbox/plugins/video";
import Counter from "yet-another-react-lightbox/plugins/counter";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import type { MediaRow } from "@/lib/types";
import { ProgressiveImage, preloadImages } from "@/components/ProgressiveImage";
import { shareLink } from "@/lib/share";
import { galleryItemUrl } from "@/lib/site-url";

type Props = {
  items: MediaRow[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  preferLowQuality?: boolean;
};

type CustomImageSlide = Slide & {
  thumb?: string | null;
  preview?: string;
  full?: string;
  media?: MediaRow;
};

function objectPosition(item: MediaRow) {
  const x = item.focal_x != null ? Math.round(item.focal_x * 100) : 50;
  const y = item.focal_y != null ? Math.round(item.focal_y * 100) : 50;
  return `${x}% ${y}%`;
}

function ShareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16 8a3 3 0 1 0-2.83-4H13a3 3 0 0 0 0 6h.17A3 3 0 0 0 16 8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 14a3 3 0 1 0-2.83-4H5a3 3 0 0 0 0 6h.17A3 3 0 0 0 8 14Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M16 20a3 3 0 1 0-2.83-4H13a3 3 0 1 0 0 6h.17A3 3 0 0 0 16 20Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M8.5 12.5 14 9.5M8.5 13.5 14 16.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function GalleryLightbox({
  items,
  index,
  open,
  onClose,
  onIndexChange,
  preferLowQuality = false,
}: Props) {
  const [shareHint, setShareHint] = useState<string | null>(null);

  const slides: Slide[] = useMemo(
    () =>
      items.map((item) => {
        if (item.media_type === "video") {
          return {
            type: "video" as const,
            width: 1920,
            height: 1080,
            sources: [{ src: item.url, type: "video/mp4" }],
            download: { url: item.url, filename: `livelens-${item.id}.mp4` },
          };
        }
        const preview = item.preview_url || item.url;
        return {
          src: preview,
          alt: item.caption || "",
          download: { url: item.url, filename: `livelens-${item.id}.jpg` },
          thumb: item.thumb_url,
          preview,
          full: item.url,
          media: item,
        } as CustomImageSlide;
      }),
    [items],
  );

  useEffect(() => {
    if (!open || index < 0 || !items[index]) return;
    const neighbors = [index - 2, index - 1, index + 1, index + 2]
      .filter((i) => i >= 0 && i < items.length)
      .map((i) => items[i].preview_url || items[i].url);
    const current = items[index];
    if (preferLowQuality) {
      preloadImages([...neighbors, current.preview_url || current.url]);
    } else {
      preloadImages([...neighbors, current.preview_url, current.url]);
    }
  }, [open, index, items, preferLowQuality]);

  async function onShareCurrent() {
    const item = items[index];
    if (!item) return;
    setShareHint(null);
    // Site deep link only — never the R2/Cloudflare asset URL
    const url = galleryItemUrl(item.id);
    const result = await shareLink({
      url,
      title: "LiveLens",
      text: item.caption?.trim() || "A moment from the celebration",
    });
    if (result === "copied") {
      setShareHint("Link copied");
      window.setTimeout(() => setShareHint(null), 2000);
    } else if (result === "shared") {
      setShareHint(null);
    } else if (result === "failed") {
      setShareHint("Could not copy link");
      window.setTimeout(() => setShareHint(null), 2000);
    }
  }

  return (
    <>
      <Lightbox
        open={open}
        close={onClose}
        index={index}
        slides={slides}
        on={{ view: ({ index: i }) => onIndexChange(i) }}
        plugins={[Download, Video, Counter]}
        carousel={{ preload: 2, finite: true }}
        controller={{ closeOnBackdropClick: true }}
        styles={{
          container: { backgroundColor: "rgba(0,0,0,0.94)" },
        }}
        toolbar={{
          buttons: [
            <button
              key="share"
              type="button"
              className="yarl__button"
              title="Share"
              aria-label="Share photo link"
              onClick={() => void onShareCurrent()}
            >
              <ShareIcon />
            </button>,
            "download",
            "close",
          ],
        }}
        render={{
          slide: ({ slide }) => {
            if ("type" in slide && slide.type === "video") return undefined;
            const s = slide as CustomImageSlide;
            const media = s.media;
            const src = "src" in s ? String(s.src) : "";
            return (
              <div className="relative flex h-full w-full flex-col items-center justify-center px-2 pb-16 pt-10">
                <ProgressiveImage
                  thumbSrc={s.thumb}
                  previewSrc={s.preview || src}
                  fullSrc={s.full || src}
                  alt={"alt" in s ? s.alt || "" : ""}
                  loadFull={!preferLowQuality}
                  fit="contain"
                  className="relative h-[70dvh] w-full max-w-5xl"
                  objectPosition={media ? objectPosition(media) : "50% 50%"}
                />
                {media?.tag && !media.caption && (
                  <p className="mt-3 max-w-xl text-center text-sm text-white/70">{media.tag}</p>
                )}
              </div>
            );
          },
        }}
      />

      {open && items[index]?.caption && (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-[10050] flex justify-center px-6 sm:top-16">
          <p className="max-w-2xl text-center font-[family-name:var(--font-display)] text-lg text-white/95 drop-shadow-[0_2px_12px_rgba(0,0,0,0.75)] sm:text-xl">
            {items[index].caption}
          </p>
        </div>
      )}

      {open && shareHint && (
        <div className="pointer-events-none fixed inset-x-0 top-28 z-[10050] flex justify-center">
          <span className="rounded-full border border-white/20 bg-black/70 px-4 py-2 text-sm text-[#e8d5b5] backdrop-blur">
            {shareHint}
          </span>
        </div>
      )}

      {open && items.length > 1 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[10050] flex justify-center gap-3">
          <button
            type="button"
            className="pointer-events-auto rounded-full border border-white/25 bg-black/60 px-5 py-2.5 text-sm text-white backdrop-blur disabled:opacity-30"
            disabled={index <= 0}
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(Math.max(0, index - 1));
            }}
          >
            Previous
          </button>
          <button
            type="button"
            className="pointer-events-auto rounded-full border border-white/25 bg-black/60 px-5 py-2.5 text-sm text-white backdrop-blur disabled:opacity-30"
            disabled={index >= items.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(Math.min(items.length - 1, index + 1));
            }}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
