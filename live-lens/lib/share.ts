/**
 * Share a URL (and optional image file) via Web Share API, with clipboard fallback.
 * Never pass R2/Cloudflare asset URLs here — use site deep links.
 */

function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
    const [header, data] = dataUrl.split(",");
    if (!header || data == null) return null;
    const mime = /data:([^;]+)/.exec(header)?.[1] || "image/png";
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  } catch {
    return null;
  }
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

function isMobile() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isAbort(err: unknown) {
  return err instanceof Error && err.name === "AbortError";
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export async function shareLink(opts: {
  url: string;
  title?: string;
  text?: string;
}): Promise<ShareResult> {
  const { url, title = "LiveLens", text } = opts;

  // Mobile: native share sheet. Desktop: copy (Web Share is awkward / often cancelled).
  if (isMobile() && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text: text || title, url });
      return "shared";
    } catch (err) {
      if (isAbort(err)) return "cancelled";
    }
  }

  if (await copyText(url)) return "copied";
  return "failed";
}

/** Share site link plus an image (e.g. QR PNG) when the browser supports file shares. */
export async function shareLinkWithImage(opts: {
  url: string;
  title?: string;
  text?: string;
  imageDataUrl?: string | null;
  imageFilename?: string;
}): Promise<ShareResult> {
  const {
    url,
    title = "LiveLens",
    text,
    imageDataUrl,
    imageFilename = "livelens-qr.png",
  } = opts;

  const file = imageDataUrl ? dataUrlToFile(imageDataUrl, imageFilename) : null;

  if (
    isMobile() &&
    file &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title,
        text: text || `${title}\n${url}`,
        url,
        files: [file],
      });
      return "shared";
    } catch (err) {
      if (isAbort(err)) return "cancelled";
    }
  }

  return shareLink({ url, title, text });
}
