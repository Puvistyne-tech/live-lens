/**
 * Backfill untagged photos (and optionally missing variants) via local AI cascade.
 *
 * Usage:
 *   node backfill-tags.js              # tag only
 *   node backfill-tags.js --variants   # also generate missing thumb/preview
 *   node backfill-tags.js --variants-only
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import PQueue from "p-queue";
import { loadConfig } from "./lib/config.js";
import { createR2Client } from "./lib/r2.js";
import { uploadPhotoVariants } from "./lib/image-variants.js";
import { createSupabaseAdmin } from "./lib/supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON = existsSync(join(__dirname, ".venv", "bin", "python3"))
  ? join(__dirname, ".venv", "bin", "python3")
  : "python3";

const args = new Set(process.argv.slice(2));
const doTags = !args.has("--variants-only");
const doVariants = args.has("--variants") || args.has("--variants-only");

function log(msg, level = "info") {
  console.log(`[backfill:${level}] ${msg}`);
}

function runPython(payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [join(__dirname, "python", "processor.py")], {
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`timeout ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr || `exit ${code}`));
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function keyFromPublicUrl(url) {
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base || !url.startsWith(base + "/")) return `backfill/${url.split("/").pop()}`;
  return url.slice(base.length + 1);
}

async function ensureVariants(row, r2, supabase) {
  if (row.thumb_url && row.preview_url) return;
  if (row.media_type !== "photo") return;

  const tmp = join(__dirname, "tmp-tags", `var-${row.id}.jpg`);
  try {
    await download(row.url, tmp);
    const originalKey = keyFromPublicUrl(row.url) || `backfill/${row.id}.jpg`;
    const { thumbUrl, previewUrl } = await uploadPhotoVariants(r2, tmp, originalKey);
    if (!thumbUrl && !previewUrl) throw new Error("variant upload returned null");
    const patch = {
      thumb_url: row.thumb_url || thumbUrl,
      preview_url: row.preview_url || previewUrl,
    };
    await supabase.from("media").update(patch).eq("id", row.id);
    Object.assign(row, patch);
    log(`Variants ${row.id}`);
  } catch (err) {
    log(`Variants failed ${row.id}: ${err.message}`, "warn");
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

async function tagRow(row, config) {
  if (row.tag || row.media_type !== "photo") return;
  const imageUrl = row.preview_url || row.thumb_url || row.url;
  const tmp = join(__dirname, "tmp-tags", `tag-${row.id}.jpg`);
  try {
    await download(imageUrl, tmp);
    const ai = await runPython(
      {
        input: tmp,
        do_depth: false,
        do_caption: true,
        tag_models: config.tagModels || ["florence2-ft", "moondream2", "smolvlm2"],
      },
      config.tagTimeoutMs || 45000,
    );
    if (ai.caption && ai.tag) {
      const supabase = createSupabaseAdmin();
      await supabase
        .from("media")
        .update({ caption: ai.caption, tag: ai.tag })
        .eq("id", row.id)
        .is("tag", null);
      log(`Tagged ${row.id} → ${ai.tag} (${ai.caption_mode || "?"})`);
    } else {
      log(`Skip tag ${row.id}: ${ai.caption_error || "empty"}`, "warn");
    }
  } catch (err) {
    log(`Tag failed ${row.id}: ${err.message}`, "warn");
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const config = loadConfig();
  const supabase = createSupabaseAdmin();
  const r2 = createR2Client();
  const queue = new PQueue({ concurrency: 1 });

  let query = supabase
    .from("media")
    .select("id, url, thumb_url, preview_url, tag, media_type")
    .eq("media_type", "photo")
    .order("created_at", { ascending: false })
    .limit(500);

  if (doTags && !doVariants) {
    query = query.is("tag", null);
  } else if (doVariants && !doTags) {
    query = query.or("thumb_url.is.null,preview_url.is.null");
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  log(`Processing ${rows.length} photo(s) (tags=${doTags}, variants=${doVariants})`);

  for (const row of rows) {
    queue.add(async () => {
      if (doVariants) await ensureVariants(row, r2, supabase);
      if (doTags) await tagRow(row, config);
    });
  }

  await queue.onIdle();
  log("Done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
