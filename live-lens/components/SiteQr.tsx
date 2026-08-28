"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { shareLinkWithImage } from "@/lib/share";
import { getSiteUrl } from "@/lib/site-url";

type Props = {
  size?: number;
  className?: string;
  label?: string;
};

export { getSiteUrl };

export function SiteQr({ size = 160, className = "", label }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const siteUrl = getSiteUrl();

  useEffect(() => {
    if (!siteUrl) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(siteUrl, {
      width: size * 2,
      margin: 1,
      color: { dark: "#1a140c", light: "#f2f0ea" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [siteUrl, size]);

  async function onShare() {
    if (!siteUrl) return;
    setHint(null);
    const result = await shareLinkWithImage({
      url: siteUrl,
      title: "LiveLens",
      text: "Join the celebration — open LiveLens to upload and browse photos.",
      imageDataUrl: dataUrl,
      imageFilename: "livelens-qr.png",
    });
    if (result === "copied") {
      setHint("Link copied");
      window.setTimeout(() => setHint(null), 2200);
    } else if (result === "failed") {
      setHint("Could not share — copy the link from the address bar");
      window.setTimeout(() => setHint(null), 3200);
    }
  }

  if (!siteUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-white/25 bg-black/30 p-4 text-center text-xs text-white/50 ${className}`}
        style={{ width: size, minHeight: size }}
      >
        Set NEXT_PUBLIC_SITE_URL
      </div>
    );
  }

  return (
    <figure className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onShare}
        disabled={!dataUrl}
        className="group relative rounded-xl bg-[#f2f0ea] p-2 shadow-lg transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a574] disabled:opacity-60"
        aria-label="Share site link and QR code"
        title="Tap to share link & QR"
      >
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt={`QR code linking to ${siteUrl}`}
            width={size}
            height={size}
            className="block rounded-lg"
          />
        ) : (
          <div className="animate-pulse rounded-lg bg-black/10" style={{ width: size, height: size }} />
        )}
        <span className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-black/70 px-2 py-1 text-center text-[10px] text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          Share link & QR
        </span>
      </button>
      {label && <figcaption className="text-xs text-white/60">{label}</figcaption>}
      {hint && <p className="text-xs text-[#e8d5b5]">{hint}</p>}
    </figure>
  );
}
