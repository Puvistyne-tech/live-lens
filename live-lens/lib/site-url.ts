/** Public site origin from env (no trailing slash). */
export function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }
  return raw.replace(/\/$/, "");
}

/** Shareable gallery deep link — never an R2/Cloudflare asset URL. */
export function galleryItemUrl(mediaId: string) {
  const base = getSiteUrl();
  if (!base) return `/gallery?id=${encodeURIComponent(mediaId)}`;
  return `${base}/gallery?id=${encodeURIComponent(mediaId)}`;
}
