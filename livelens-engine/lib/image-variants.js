import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client } from "./r2.js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PYTHON = existsSync(join(ROOT, ".venv", "bin", "python3"))
  ? join(ROOT, ".venv", "bin", "python3")
  : "python3";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function variantKeys(originalKey) {
  const base = originalKey.replace(/\.[^.]+$/, "");
  return {
    thumbKey: `${base}-thumb.jpg`,
    previewKey: `${base}-preview.jpg`,
  };
}

function runVariantsPy(inputPath, thumbOut, previewOut) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [join(ROOT, "python", "variants.py")], {
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `variants.py exit ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    proc.stdin.write(
      JSON.stringify({ input: inputPath, thumb_out: thumbOut, preview_out: previewOut }),
    );
    proc.stdin.end();
  });
}

/**
 * Generate thumb (~400) + preview (~1280) from a local image and upload to R2.
 * Fail-open: returns nulls on error.
 */
export async function uploadPhotoVariants(client, localPath, originalKey) {
  const work = join(tmpdir(), `livelens-var-${randomUUID()}`);
  mkdirSync(work, { recursive: true });
  const thumbLocal = join(work, "thumb.jpg");
  const previewLocal = join(work, "preview.jpg");

  try {
    const result = await runVariantsPy(localPath, thumbLocal, previewLocal);
    if (!result.ok) throw new Error(result.error || "variants failed");

    const { thumbKey, previewKey } = variantKeys(originalKey);
    const bucket = requireEnv("R2_BUCKET");
    const publicBase = requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");
    const r2 = client || createR2Client();

    await Promise.all([
      r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: thumbKey,
          Body: readFileSync(thumbLocal),
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      ),
      r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: previewKey,
          Body: readFileSync(previewLocal),
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      ),
    ]);

    return {
      thumbUrl: `${publicBase}/${thumbKey}`,
      previewUrl: `${publicBase}/${previewKey}`,
    };
  } catch {
    return { thumbUrl: null, previewUrl: null };
  } finally {
    for (const f of [thumbLocal, previewLocal]) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}
