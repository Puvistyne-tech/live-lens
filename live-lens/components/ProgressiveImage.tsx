"use client";

import { useEffect, useState } from "react";

type Props = {
  thumbSrc?: string | null;
  previewSrc?: string | null;
  fullSrc: string;
  alt?: string;
  className?: string;
  objectPosition?: string;
  /** cover for grid tiles, contain for lightbox */
  fit?: "cover" | "contain";
  /** When true, eagerly load full after preview (lightbox). */
  loadFull?: boolean;
};

/**
 * Immich-style layered progressive image: thumb → preview → optional full.
 */
export function ProgressiveImage({
  thumbSrc,
  previewSrc,
  fullSrc,
  alt = "",
  className = "",
  objectPosition = "50% 50%",
  fit = "cover",
  loadFull = false,
}: Props) {
  const [previewReady, setPreviewReady] = useState(false);
  const [fullReady, setFullReady] = useState(false);

  const mid = previewSrc || fullSrc;
  const low = thumbSrc || mid;
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  useEffect(() => {
    setPreviewReady(false);
    setFullReady(false);
  }, [thumbSrc, previewSrc, fullSrc]);

  useEffect(() => {
    if (!loadFull || !fullSrc) return;
    const img = new Image();
    img.src = fullSrc;
    if (img.complete) setFullReady(true);
    else img.onload = () => setFullReady(true);
  }, [loadFull, fullSrc]);

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={low}
        alt={alt}
        className={`absolute inset-0 h-full w-full ${fitClass}`}
        style={{ objectPosition }}
        loading="lazy"
        decoding="async"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mid}
        alt=""
        aria-hidden
        className={`absolute inset-0 h-full w-full ${fitClass} transition-opacity duration-300 ${
          previewReady ? "opacity-100" : "opacity-0"
        }`}
        style={{ objectPosition }}
        loading="lazy"
        decoding="async"
        onLoad={() => setPreviewReady(true)}
      />
      {loadFull && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fullSrc}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full ${fitClass} transition-opacity duration-500 ${
            fullReady ? "opacity-100" : "opacity-0"
          }`}
          style={{ objectPosition }}
          decoding="async"
        />
      )}
    </span>
  );
}

/** Preload adjacent preview URLs (and optional full for current). */
export function preloadImages(urls: (string | null | undefined)[]) {
  for (const url of urls) {
    if (!url) continue;
    const img = new Image();
    img.src = url;
  }
}
