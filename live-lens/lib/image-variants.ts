import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client, publicUrlForKey } from "@/lib/r2";

export type ImageVariants = {
  thumbBuffer: Buffer;
  previewBuffer: Buffer;
  thumbKey: string;
  previewKey: string;
  thumbUrl: string;
  previewUrl: string;
};

function variantKeys(originalKey: string) {
  const base = originalKey.replace(/\.[^.]+$/, "");
  return {
    thumbKey: `${base}-thumb.jpg`,
    previewKey: `${base}-preview.jpg`,
  };
}

/** Build JPEG thumb (~400px) and preview (~1280px) from an image buffer. */
export async function makeImageVariants(buffer: Buffer, originalKey: string): Promise<ImageVariants> {
  const { thumbKey, previewKey } = variantKeys(originalKey);

  const [thumbBuffer, previewBuffer] = await Promise.all([
    sharp(buffer)
      .rotate()
      .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer(),
    sharp(buffer)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer(),
  ]);

  return {
    thumbBuffer,
    previewBuffer,
    thumbKey,
    previewKey,
    thumbUrl: publicUrlForKey(thumbKey),
    previewUrl: publicUrlForKey(previewKey),
  };
}

export async function uploadImageVariants(
  buffer: Buffer,
  originalKey: string,
): Promise<{ thumbUrl: string; previewUrl: string } | null> {
  try {
    const variants = await makeImageVariants(buffer, originalKey);
    const client = createR2Client();
    const bucket = process.env.R2_BUCKET!;
    await Promise.all([
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: variants.thumbKey,
          Body: variants.thumbBuffer,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      ),
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: variants.previewKey,
          Body: variants.previewBuffer,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      ),
    ]);
    return { thumbUrl: variants.thumbUrl, previewUrl: variants.previewUrl };
  } catch {
    return null;
  }
}
