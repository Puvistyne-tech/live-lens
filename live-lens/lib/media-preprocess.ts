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

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export async function getVideoDurationMs(file: Blob): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    return await new Promise<number>((resolve, reject) => {
      video.onloadedmetadata = () => {
        const d = video.duration;
        if (!Number.isFinite(d) || d <= 0) {
          reject(new Error("Could not read video duration"));
          return;
        }
        resolve(Math.round(d * 1000));
      };
      video.onerror = () => reject(new Error("Could not read video"));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function assertVideoDuration(durationMs: number, maxSeconds: number) {
  if (durationMs > maxSeconds * 1000 + 250) {
    throw new Error(`Video must be ${maxSeconds}s or shorter`);
  }
}

export function isVideoTooLong(durationMs: number, maxSeconds: number) {
  return durationMs > maxSeconds * 1000 + 250;
}

/** Duration + hard size check (gallery/staff upload). */
export async function validateVideoFile(
  file: File,
  opts: { maxBytes: number; maxSeconds: number },
): Promise<{ durationMs: number }> {
  if (file.size > opts.maxBytes) {
    throw new Error(`Video exceeds ${Math.round(opts.maxBytes / (1024 * 1024))}MB limit`);
  }
  const durationMs = await getVideoDurationMs(file);
  assertVideoDuration(durationMs, opts.maxSeconds);
  return { durationMs };
}

async function reencodeVideo(
  source: Blob,
  opts: {
    maxEdge: number;
    bitsPerSecond: number;
    /** Inclusive start of the clip (ms). */
    startMs?: number;
    /** Exclusive end of the clip (ms). Defaults to full duration. */
    endMs?: number;
  },
): Promise<File> {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined") {
    throw new Error("Video compression is not supported on this browser");
  }

  const mime = pickRecorderMime();
  const url = URL.createObjectURL(source);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  // Required for programmatic play on some mobile browsers
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Could not decode video"));
      video.src = url;
      video.load();
    });

    const fullMs = Math.round((Number.isFinite(video.duration) ? video.duration : 0) * 1000);
    const startMs = Math.max(0, Math.min(opts.startMs ?? 0, Math.max(0, fullMs - 100)));
    const endMs = Math.min(
      fullMs || Number.POSITIVE_INFINITY,
      opts.endMs ?? fullMs,
    );
    if (!(endMs > startMs + 200)) {
      throw new Error("Trim window is too short");
    }

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const scale = Math.min(1, opts.maxEdge / Math.max(vw, vh));
    const width = Math.max(2, Math.round((vw * scale) / 2) * 2);
    const height = Math.max(2, Math.round((vh * scale) / 2) * 2);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    if (typeof canvas.captureStream !== "function") {
      throw new Error("Video compression is not supported on this browser");
    }

    const canvasStream = canvas.captureStream(30);

    try {
      const mediaEl = video as HTMLVideoElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      const mediaStream = mediaEl.captureStream?.() ?? mediaEl.mozCaptureStream?.();
      if (mediaStream) {
        for (const track of mediaStream.getAudioTracks()) {
          canvasStream.addTrack(track);
        }
      }
    } catch {
      /* video-only re-encode */
    }

    const recorder = mime
      ? new MediaRecorder(canvasStream, {
          mimeType: mime,
          videoBitsPerSecond: opts.bitsPerSecond,
        })
      : new MediaRecorder(canvasStream, { videoBitsPerSecond: opts.bitsPerSecond });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "video/webm";
        resolve(new Blob(chunks, { type }));
      };
      recorder.onerror = () => reject(new Error("Recording failed during compression"));
    });

    video.currentTime = startMs / 1000;
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      video.onerror = () => reject(new Error("Could not seek video"));
      // Some browsers fire seeked synchronously if already there
      if (Math.abs(video.currentTime * 1000 - startMs) < 80 && video.readyState >= 2) {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      }
    });

    recorder.start(200);
    await video.play();

    let raf = 0;
    const endSec = endMs / 1000;
    const draw = () => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, width, height);
      if (video.currentTime >= endSec) {
        video.pause();
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    await new Promise<void>((resolve, reject) => {
      const finish = () => resolve();
      video.onended = finish;
      video.onpause = () => {
        if (video.currentTime >= endSec - 0.05) finish();
      };
      video.onerror = () => reject(new Error("Video playback failed during compression"));
      // Safety timeout slightly past clip length
      window.setTimeout(finish, Math.max(500, endMs - startMs + 800));
    });

    cancelAnimationFrame(raf);
    ctx.drawImage(video, 0, 0, width, height);

    if (recorder.state !== "inactive") recorder.stop();
    canvasStream.getTracks().forEach((t) => t.stop());

    const blob = await recorded;
    if (!blob.size) throw new Error("Compression produced empty video");

    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    return new File([blob], `wish.${ext}`, { type: blob.type || `video/${ext}` });
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

const REENCODE_STEPS = [
  { maxEdge: 1280, bitsPerSecond: 1_500_000 },
  { maxEdge: 960, bitsPerSecond: 900_000 },
  { maxEdge: 720, bitsPerSecond: 500_000 },
  { maxEdge: 640, bitsPerSecond: 350_000 },
] as const;

async function reencodeUntilUnderBytes(
  source: Blob,
  opts: { maxBytes: number; startMs?: number; endMs?: number },
): Promise<File> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error(
      `Video exceeds ${Math.round(opts.maxBytes / (1024 * 1024))}MB and this browser can’t compress it`,
    );
  }

  let lastBlob: File | null = null;
  let lastErr: Error | null = null;

  for (const step of REENCODE_STEPS) {
    try {
      const compressed = await reencodeVideo(source, {
        ...step,
        startMs: opts.startMs,
        endMs: opts.endMs,
      });
      lastBlob = compressed;
      if (compressed.size <= opts.maxBytes) return compressed;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error("Compression failed");
    }
  }

  if (lastBlob && lastBlob.size <= opts.maxBytes * 1.15) return lastBlob;

  throw (
    lastErr ??
    new Error(
      `Video is still too large after compression (max ${Math.round(opts.maxBytes / (1024 * 1024))}MB)`,
    )
  );
}

/**
 * Ensures duration ≤ maxSeconds and size ≤ maxBytes, re-encoding via canvas
 * + MediaRecorder when the source is oversized.
 * Callers that want a trim UI should check {@link isVideoTooLong} first.
 */
export async function compressVideoFile(
  file: File,
  opts: { maxBytes: number; maxSeconds: number },
): Promise<{ file: File; durationMs: number }> {
  const durationMs = await getVideoDurationMs(file);
  assertVideoDuration(durationMs, opts.maxSeconds);

  if (file.size <= opts.maxBytes) {
    return { file, durationMs };
  }

  const compressed = await reencodeUntilUnderBytes(file, { maxBytes: opts.maxBytes });
  return { file: compressed, durationMs };
}

/**
 * Cuts a maxSeconds window starting at startMs, then compresses if still over maxBytes.
 */
export async function trimVideoFile(
  file: File,
  opts: { startMs: number; maxSeconds: number; maxBytes: number },
): Promise<{ file: File; durationMs: number }> {
  const fullMs = await getVideoDurationMs(file);
  const maxMs = Math.max(1, opts.maxSeconds) * 1000;
  const startMs = Math.max(0, Math.min(opts.startMs, Math.max(0, fullMs - Math.min(maxMs, fullMs))));
  const endMs = Math.min(fullMs, startMs + maxMs);
  const durationMs = Math.max(0, endMs - startMs);

  if (durationMs < 200) {
    throw new Error("Trim window is too short");
  }

  // Already short enough and under size — still re-encode if we need a sub-clip
  if (startMs <= 50 && endMs >= fullMs - 50 && file.size <= opts.maxBytes) {
    return { file, durationMs: fullMs };
  }

  const trimmed = await reencodeUntilUnderBytes(file, {
    maxBytes: opts.maxBytes,
    startMs,
    endMs,
  });
  return { file: trimmed, durationMs };
}
