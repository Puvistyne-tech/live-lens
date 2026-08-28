"use client";

let modelsPromise: Promise<void> | null = null;

const MODEL_URL = "/models";
const LOAD_TIMEOUT_MS = 12_000;

type FaceApi = typeof import("@vladmandic/face-api");

async function loadFaceApi(): Promise<FaceApi> {
  // Turbopack/webpack can resolve the package "main" (Node build). Import the
  // browser ESM build explicitly to avoid TextEncoder util errors.
  return import(
    /* webpackIgnore: false */
    "@vladmandic/face-api/dist/face-api.esm.js"
  ) as Promise<FaceApi>;
}

async function ensureModels(faceapi: FaceApi) {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      await Promise.race([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("face-model-timeout")), LOAD_TIMEOUT_MS),
        ),
      ]);
    })().catch((err) => {
      modelsPromise = null;
      throw err;
    });
  }
  await modelsPromise;
}

/**
 * Detect the largest face and return normalized focal point (0–1).
 * Fail-open: returns null if models/detection unavailable.
 */
export async function detectPrimaryFaceFocal(
  file: File,
): Promise<{ focal_x: number; focal_y: number } | null> {
  if (typeof window === "undefined") return null;

  let faceapi: FaceApi;
  try {
    faceapi = await loadFaceApi();
    await ensureModels(faceapi);
  } catch {
    return null;
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image-load-failed"));
      el.src = url;
    });

    const detections = await faceapi.detectAllFaces(
      img,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }),
    );
    if (!detections.length) return null;

    const best = detections.reduce((a, b) =>
      a.box.width * a.box.height >= b.box.width * b.box.height ? a : b,
    );
    const cx = best.box.x + best.box.width / 2;
    const cy = best.box.y + best.box.height / 2;
    const focal_x = Math.min(1, Math.max(0, cx / img.naturalWidth));
    const focal_y = Math.min(1, Math.max(0, cy / img.naturalHeight));
    return { focal_x, focal_y };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
