/** Bake 2–4 photos into one square JPEG collage (guest Share multi-photo). */

const SIZE = 1600;
const GAP = 6;
const JPEG_QUALITY = 0.88;

type Drawable = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number) => void;
  cleanup: () => void;
};

async function loadDrawable(file: File): Promise<Drawable> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, dx, dy, dw, dh) => {
        const scale = Math.max(dw / bitmap.width, dh / bitmap.height);
        const sw = dw / scale;
        const sh = dh / scale;
        const sx = (bitmap.width - sw) / 2;
        const sy = (bitmap.height - sh) / 2;
        ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
      },
      cleanup: () => bitmap.close(),
    };
  } catch {
    /* fall through */
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not decode photo for collage"));
    img.src = url;
  });
  if (!img.naturalWidth || !img.naturalHeight) {
    URL.revokeObjectURL(url);
    throw new Error("Could not decode photo for collage");
  }
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    draw: (ctx, dx, dy, dw, dh) => {
      const scale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
      const sw = dw / scale;
      const sh = dh / scale;
      const sx = (img.naturalWidth - sw) / 2;
      const sy = (img.naturalHeight - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    },
    cleanup: () => URL.revokeObjectURL(url),
  };
}

type Rect = { x: number; y: number; w: number; h: number };

function layoutRects(count: number): Rect[] {
  const s = SIZE;
  const g = GAP;
  if (count === 2) {
    const w = (s - g) / 2;
    return [
      { x: 0, y: 0, w, h: s },
      { x: w + g, y: 0, w, h: s },
    ];
  }
  if (count === 3) {
    const leftW = (s - g) * 0.58;
    const rightW = s - g - leftW;
    const halfH = (s - g) / 2;
    return [
      { x: 0, y: 0, w: leftW, h: s },
      { x: leftW + g, y: 0, w: rightW, h: halfH },
      { x: leftW + g, y: halfH + g, w: rightW, h: halfH },
    ];
  }
  // 4 → 2×2
  const cell = (s - g) / 2;
  return [
    { x: 0, y: 0, w: cell, h: cell },
    { x: cell + g, y: 0, w: cell, h: cell },
    { x: 0, y: cell + g, w: cell, h: cell },
    { x: cell + g, y: cell + g, w: cell, h: cell },
  ];
}

/**
 * Composite 2–4 image files into one square JPEG.
 * @throws if count is not 2–4 or decoding fails
 */
export async function bakeCollage(files: File[]): Promise<File> {
  if (files.length < 2 || files.length > 4) {
    throw new Error("Collage needs 2 to 4 photos");
  }

  const drawables = await Promise.all(files.map(loadDrawable));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create collage canvas");

    ctx.fillStyle = "#0d0f14";
    ctx.fillRect(0, 0, SIZE, SIZE);

    const rects = layoutRects(files.length);
    for (let i = 0; i < drawables.length; i++) {
      const r = rects[i];
      drawables[i].draw(ctx, r.x, r.y, r.w, r.h);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("Could not encode collage");
    return new File([blob], `collage-${Date.now()}.jpg`, { type: "image/jpeg" });
  } finally {
    for (const d of drawables) d.cleanup();
  }
}
