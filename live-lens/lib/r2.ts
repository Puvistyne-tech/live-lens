import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export function createR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export function publicUrlForKey(key: string) {
  return `${requireEnv("R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}

export async function createPresignedUpload(opts: {
  folder: "guest" | "staff";
  contentType: string;
  extension: string;
}) {
  const client = createR2Client();
  const key = `${opts.folder}/${Date.now()}-${randomUUID()}.${opts.extension.replace(/^\./, "")}`;
  const command = new PutObjectCommand({
    Bucket: requireEnv("R2_BUCKET"),
    Key: key,
    ContentType: opts.contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
  return { uploadUrl, key, publicUrl: publicUrlForKey(key) };
}
