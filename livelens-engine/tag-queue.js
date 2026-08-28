/**
 * Non-blocking Mac-edge tag queue.
 * Listens for media INSERT/UPDATE where tag IS NULL (photos),
 * downloads preview from R2, runs Florence→Moondream→SmolVLM cascade,
 * updates row on success. Failures leave tag null and continue.
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
import { createSupabaseAdmin } from "./lib/supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON = existsSync(join(__dirname, ".venv", "bin", "python3"))
  ? join(__dirname, ".venv", "bin", "python3")
  : "python3";

const queue = new PQueue({ concurrency: 1 });
const seen = new Set();
let channel = null;
let running = false;

function log(message, level = "info") {
  console.log(`[tag-queue:${level}] ${message}`);
}

function runPython(script, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [join(__dirname, "python", script)], {
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || `python ${script} exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

async function downloadToTemp(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

async function tagOne(row) {
  const config = loadConfig();
  if (config.captionEnabled === false) return;

  const supabase = createSupabaseAdmin();
  const { data: fresh } = await supabase
    .from("media")
    .select("id, url, preview_url, thumb_url, tag, media_type")
    .eq("id", row.id)
    .maybeSingle();

  if (!fresh || fresh.media_type !== "photo" || fresh.tag) return;

  const imageUrl = fresh.preview_url || fresh.thumb_url || fresh.url;
  if (!imageUrl) return;

  const tmpDir = join(__dirname, "tmp-tags");
  mkdirSync(tmpDir, { recursive: true });
  const localPath = join(tmpDir, `${fresh.id}.jpg`);

  try {
    await downloadToTemp(imageUrl, localPath);
    const timeoutMs = config.tagTimeoutMs || 180000;
    const ai = await runPython(
      "processor.py",
      {
        input: localPath,
        do_depth: false,
        do_caption: true,
        tag_models: config.tagModels || ["florence2-ft", "moondream2", "smolvlm2"],
      },
      timeoutMs,
    );

    if (ai.caption && ai.tag) {
      const { error } = await supabase
        .from("media")
        .update({ caption: ai.caption, tag: ai.tag })
        .eq("id", fresh.id)
        .is("tag", null);
      if (error) throw error;
      log(`Tagged ${fresh.id} → ${ai.tag} (${ai.caption_mode || "?"})`);
    } else {
      log(`No tag for ${fresh.id}: ${ai.caption_error || "empty"}`, "warn");
    }
  } catch (err) {
    log(`Tag failed ${fresh.id}: ${err.message}`, "warn");
  } finally {
    try {
      if (existsSync(localPath)) unlinkSync(localPath);
    } catch {
      /* ignore */
    }
    seen.delete(row.id);
  }
}

function enqueue(row) {
  if (!row?.id || row.media_type === "video" || row.tag) return;
  if (seen.has(row.id)) return;
  seen.add(row.id);
  queue.add(() => tagOne(row)).catch((err) => log(err.message, "error"));
}

export async function startTagQueue() {
  if (running) return;
  const config = loadConfig();
  if (config.tagQueueEnabled === false || config.captionEnabled === false) {
    log("Tag queue disabled by config");
    return;
  }

  const supabase = createSupabaseAdmin();
  channel = supabase
    .channel("engine-tag-queue")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "media" },
      (payload) => enqueue(payload.new),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "media" },
      (payload) => {
        const row = payload.new;
        if (row && !row.tag) enqueue(row);
      },
    )
    .subscribe((status) => log(`realtime ${status}`));

  // Catch-up pass for existing untagged photos
  const { data } = await supabase
    .from("media")
    .select("id, url, preview_url, thumb_url, tag, media_type")
    .is("tag", null)
    .eq("media_type", "photo")
    .order("created_at", { ascending: false })
    .limit(50);

  for (const row of data || []) enqueue(row);

  running = true;
  log("Tag queue started (Florence-2-ft → Moondream2 → SmolVLM2)");
}

export async function stopTagQueue() {
  if (channel) {
    const supabase = createSupabaseAdmin();
    await supabase.removeChannel(channel);
    channel = null;
  }
  running = false;
  log("Tag queue stopped");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startTagQueue().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
