function isLikelyVideo(file: File) {
  if (file.type.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm)$/i.test(file.name);
}

function isLikelyHeic(file: File) {
  const t = file.type.toLowerCase();
  if (t.includes("heic") || t.includes("heif")) return true;
  return /\.(heic|heif)$/i.test(file.name);
}

async function decodeToDrawable(file: File): Promise<{
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  // Prefer createImageBitmap when it works (fast path)
  try {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      cleanup: () => bitmap.close(),
    };
  } catch {
    // Fall through — common on iPhone HEIC / some gallery JPEGs
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode-failed"));
      img.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error("decode-failed");
    }
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(
      isLikelyHeic(file)
        ? "This phone photo format (HEIC) can’t be processed in the browser. In iPhone Settings → Camera → Formats, choose Most Compatible, then retry — or take a new photo with the in-page camera."
        : "This photo could not be decoded. Try another image or take a new photo.",
    );
  }
}

export async function compressImageFile(
  file: File,
  opts?: { maxBytes?: number; quality?: number; maxEdge?: number },
): Promise<File> {
  const maxBytes = opts?.maxBytes ?? 1_200_000;
  const maxEdge = opts?.maxEdge ?? 1920;
  let quality = opts?.quality ?? 0.82;

  // Already a small JPEG — skip re-encode if under soft target
  if (
    (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) &&
    file.size <= maxBytes
  ) {
    // Still try mild compress only if large; otherwise return as-is
    if (file.size <= Math.min(maxBytes, 900_000)) {
      return file.type === "image/jpeg"
        ? file
        : new File([file], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  }

  let drawable: Awaited<ReturnType<typeof decodeToDrawable>>;
  try {
    drawable = await decodeToDrawable(file);
  } catch (err) {
    // Last resort: if already JPEG-ish and under hard cap, upload original
    if (
      file.size <= maxBytes &&
      (file.type === "image/jpeg" || file.type === "image/jpg" || /\.jpe?g$/i.test(file.name) || !file.type)
    ) {
      return new File([file], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
    }
    throw err;
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(drawable.width, drawable.height));
    const width = Math.max(1, Math.round(drawable.width * scale));
    const height = Math.max(1, Math.round(drawable.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");

    ctx.filter = "contrast(1.08) saturate(1.12)";
    drawable.draw(ctx, width, height);

    const toBlob = (q: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));

    let blob = await toBlob(quality);
    while (blob && blob.size > maxBytes && quality > 0.45) {
      quality -= 0.08;
      blob = await toBlob(quality);
    }
    if (!blob) throw new Error("Compression failed");
    if (blob.size > maxBytes * 1.5) {
      throw new Error("Photo is still too large after compression");
    }

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } finally {
    drawable.cleanup();
  }
}

export { isLikelyVideo };

export async function validateVideoFile(
  file: File,
  opts: { maxBytes: number; maxSeconds: number },
): Promise<{ durationMs: number }> {
  if (file.size > opts.maxBytes) {
    throw new Error(`Video exceeds ${Math.round(opts.maxBytes / (1024 * 1024))}MB limit`);
  }

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const durationMs = await new Promise<number>((resolve, reject) => {
      video.onloadedmetadata = () => {
        resolve(Math.round((video.duration || 0) * 1000));
      };
      video.onerror = () => reject(new Error("Could not read video"));
      video.src = url;
    });
    if (durationMs > opts.maxSeconds * 1000 + 250) {
      throw new Error(`Video must be ${opts.maxSeconds}s or shorter`);
    }
    return { durationMs };
  } finally {
    URL.revokeObjectURL(url);
  }
}
