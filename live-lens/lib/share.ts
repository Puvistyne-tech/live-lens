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

export type ShareResult = "shared" | "copied" | "failed";

export async function shareLink(opts: {
  url: string;
  title?: string;
  text?: string;
}): Promise<ShareResult> {
  const { url, title = "LiveLens", text } = opts;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, text: text || title, url });
      return "shared";
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "failed";
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
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

  try {
    if (
      file &&
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        title,
        text: text || `${title}\n${url}`,
        url,
        files: [file],
      });
      return "shared";
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "failed";
  }

  return shareLink({ url, title, text });
}
