import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";

function requireEnv(name) {
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

export async function uploadFileToR2(client, localPath, key, contentType = "image/jpeg") {
  const body = await readFile(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET"),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  const publicBase = requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");
  return `${publicBase}/${key}`;
}

export function makeProKey(localPath) {
  const stamp = Date.now();
  const name = basename(localPath).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `pro/${stamp}-${name}`;
}
