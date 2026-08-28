import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync, statSync, copyFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";
import PQueue from "p-queue";
import { loadConfig } from "./lib/config.js";
import { groupBurstFamilies } from "./lib/burst-group.js";
import { createR2Client, makeProKey, uploadFileToR2 } from "./lib/r2.js";
import { uploadPhotoVariants } from "./lib/image-variants.js";
import { createSupabaseAdmin, insertProPhoto, updateMediaAi } from "./lib/supabase.js";
import { REJECTED_DIR, ensureRejectedDir, resolveRejectedFile, removeRejectedFile } from "./lib/rejects.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON = existsSync(join(__dirname, ".venv", "bin", "python3"))
  ? join(__dirname, ".venv", "bin", "python3")
  : "python3";
const STAGING_DIR = join(__dirname, "staging");
const ENHANCED_DIR = join(__dirname, "enhanced");
const COMPRESSED_DIR = join(__dirname, "compressed");

let uploadQueue = new PQueue({ concurrency: 2 });
const aiQueue = new PQueue({ concurrency: 1 });
const logs = [];
const MAX_LOGS = 200;

let watcher = null;
let burstTimer = null;
let burstFiles = [];
let lastUploadAt = 0;
let running = false;

function log(message, level = "info") {
  const entry = { ts: new Date().toISOString(), level, message };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  console.log(`[${level}] ${message}`);
}

function syncUploadConcurrency() {
  const config = loadConfig();
  const n = Math.max(1, Math.min(Number(config.processConcurrency) || 2, 4));
  if (uploadQueue.concurrency !== n) {
    uploadQueue.concurrency = n;
  }
}

export function getEngineStatus() {
  const config = loadConfig();
  return {
    running,
    watchRoots: config.watchRoots,
    recursive: config.recursive,
    burstPending: burstFiles.length,
    uploadPending: uploadQueue.size + uploadQueue.pending,
    aiPending: aiQueue.size + aiQueue.pending,
    logs: logs.slice(-80),
  };
}

function runPython(script, payload, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [join(__dirname, "python", script)], {
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      reject(new Error(`python ${script} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
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

async function waitStable(filePath, tries = 8) {
  let last = -1;
  for (let i = 0; i < tries; i++) {
    if (!existsSync(filePath)) return false;
    const size = statSync(filePath).size;
    if (size > 0 && size === last) return true;
    last = size;
    await new Promise((r) => setTimeout(r, 250));
  }
  return existsSync(filePath);
}

function shouldAccept(filePath, config) {
  const name = basename(filePath).toLowerCase();
  if (name.startsWith("probe-") || name.startsWith(".")) return false;
  const ext = extname(filePath).toLowerCase();
  if (config.ignoreRaw?.includes(ext)) return false;
  if (!config.extensions.map((e) => e.toLowerCase()).includes(ext)) return false;
  try {
    const size = statSync(filePath).size;
    if (size < (config.minFileBytes || 0)) return false;
  } catch {
    return false;
  }
  return true;
}

/** Copy winner out of inbox immediately so later deletes/FTP churn can't race the queue. */
function stageWinner(filePath) {
  mkdirSync(STAGING_DIR, { recursive: true });
  if (!existsSync(filePath)) return null;
  const dest = join(STAGING_DIR, `${Date.now()}-${basename(filePath)}`);
  try {
    copyFileSync(filePath, dest);
    return dest;
  } catch (err) {
    log(`Could not stage ${basename(filePath)}: ${err.message}`, "error");
    return null;
  }
}

function enqueueAiFollowup({ mediaId, uploadPath, configSnapshot }) {
  const doDepth = configSnapshot.depthEnabled !== false;
  const doCaption = configSnapshot.captionEnabled !== false;
  if (!doDepth && !doCaption) return;

  void aiQueue.add(async () => {
    try {
      if (!existsSync(uploadPath)) {
        log(`AI skip, file missing: ${basename(uploadPath)}`, "warn");
        return;
      }
      const configNow = loadConfig();
      const aiTimeout =
        Number(configNow.tagTimeoutMs) > 0
          ? Math.max(Number(configNow.tagTimeoutMs), 60000)
          : 180000;
      mkdirSync(ENHANCED_DIR, { recursive: true });
      const stamp = Date.now();
      const depthOut = join(
        ENHANCED_DIR,
        `${stamp}-${basename(uploadPath, extname(uploadPath))}-depth.jpg`,
      );
      log(
        `AI follow-up starting for media ${mediaId} (depth=${doDepth}, caption=${doCaption}, timeout=${aiTimeout}ms)`,
      );
      const ai = await runPython(
        "processor.py",
        {
          input: uploadPath,
          depth_output: depthOut,
          do_depth: doDepth,
          do_caption: doCaption,
          tag_models: configNow.tagModels || ["florence2-ft", "moondream2", "smolvlm2"],
        },
        aiTimeout,
      );

      let depthMapUrl = null;
      if (ai.depth_path && existsSync(ai.depth_path)) {
        const r2 = createR2Client();
        const depthKey = makeProKey(ai.depth_path).replace(/(\.[^.]+)?$/, "-depth.jpg");
        depthMapUrl = await uploadFileToR2(r2, ai.depth_path, depthKey);
        log(`Depth map (${ai.depth_mode || "ok"}): ${basename(ai.depth_path)}`);
      }
      if (ai.caption_error) log(`Caption warning: ${ai.caption_error}`, "warn");
      if (ai.depth_error) log(`Depth warning: ${ai.depth_error}`, "warn");

      const supabase = createSupabaseAdmin();
      await updateMediaAi(supabase, mediaId, {
        depthMapUrl,
        caption: ai.caption || null,
        tag: ai.tag || null,
      });
      log(
        `AI follow-up done for media ${mediaId}${ai.tag ? ` [${ai.tag}]` : ""}`,
      );
    } catch (err) {
      log(`AI follow-up failed for media ${mediaId}: ${err.message || err}`, "warn");
    }
  });
}

/**
 * Enhance (optional) → R2 → Supabase insert, then enqueue background AI.
 * Returns { url, mediaId } on success.
 */
async function processStagedPhoto(stagedPath) {
  if (!existsSync(stagedPath)) {
    log(`Staged file gone, skipping: ${basename(stagedPath)}`, "warn");
    return null;
  }

  const configNow = loadConfig();
  mkdirSync(ENHANCED_DIR, { recursive: true });
  mkdirSync(COMPRESSED_DIR, { recursive: true });

  if (configNow.minIntervalMs > 0) {
    const wait = configNow.minIntervalMs - (Date.now() - lastUploadAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  let uploadPath = stagedPath;
  if (configNow.aiEnabled) {
    const out = join(ENHANCED_DIR, `${Date.now()}-${basename(stagedPath)}`);
    try {
      const enhanced = await runPython(
        "enhance.py",
        {
          input: stagedPath,
          output: out,
          weight: configNow.codeformerWeight ?? 0.7,
        },
        180000,
      );
      if (enhanced.ok && enhanced.path && existsSync(enhanced.path)) {
        uploadPath = enhanced.path;
        log(`Enhanced (${enhanced.mode}): ${basename(stagedPath)}`);
      } else if (enhanced.error) {
        log(`Enhance skipped: ${enhanced.error}`, "warn");
      }
    } catch (err) {
      log(`Enhance failed, using staged original: ${err.message}`, "warn");
    }
  }

  if (!existsSync(uploadPath)) {
    log(`Nothing to upload (missing): ${basename(uploadPath)}`, "error");
    return null;
  }

  const maxEdge = Number(configNow.uploadMaxEdge) > 0 ? Number(configNow.uploadMaxEdge) : 2048;
  const jpegQuality = Number(configNow.uploadJpegQuality) > 0 ? Number(configNow.uploadJpegQuality) : 78;
  const compressedOut = join(COMPRESSED_DIR, `${Date.now()}-${basename(uploadPath).replace(/\.[^.]+$/, "")}.jpg`);
  try {
    const compressed = await runPython(
      "compress_upload.py",
      {
        input: uploadPath,
        output: compressedOut,
        max_edge: maxEdge,
        quality: jpegQuality,
      },
      60000,
    );
    if (compressed.ok && compressed.path && existsSync(compressed.path)) {
      const kb = Math.round((compressed.bytes || 0) / 1024);
      log(`Compressed for upload: ${maxEdge}px @ q${jpegQuality} → ${kb}KB`);
      uploadPath = compressed.path;
    } else if (compressed.error) {
      log(`Compress skipped: ${compressed.error}`, "warn");
    }
  } catch (err) {
    log(`Compress failed, uploading source: ${err.message}`, "warn");
  }

  if (!existsSync(uploadPath)) {
    log(`Nothing to upload (missing): ${basename(uploadPath)}`, "error");
    return null;
  }

  const r2 = createR2Client();
  const supabase = createSupabaseAdmin();

  log(`Uploading to R2: ${basename(uploadPath)}`);
  const key = makeProKey(uploadPath);
  const url = await uploadFileToR2(r2, uploadPath, key);
  log(`R2 ok: ${url}`);
  const { thumbUrl, previewUrl } = await uploadPhotoVariants(r2, uploadPath, key);
  log(`Inserting Supabase media row…`);
  const row = await insertProPhoto(supabase, {
    url,
    thumbUrl,
    previewUrl,
    depthMapUrl: null,
    caption: null,
    tag: null,
  });
  lastUploadAt = Date.now();
  log(`Uploaded pro photo: ${url}`);

  enqueueAiFollowup({
    mediaId: row.id,
    uploadPath,
    configSnapshot: configNow,
  });

  return { url, mediaId: row.id, uploadPath };
}

function enqueueUpload(stagedPath) {
  syncUploadConcurrency();
  void uploadQueue.add(async () => {
    try {
      await processStagedPhoto(stagedPath);
    } catch (err) {
      log(`Upload pipeline failed for ${basename(stagedPath)}: ${err.message || err}`, "error");
    }
  });
}

async function processBurstFamily(files, config) {
  if (!files.length) return;

  const keep = Math.max(1, Math.min(config.burstKeep || 1, 2));
  let winners = files;

  if (files.length === 1) {
    winners = files;
  } else {
    try {
      const result = await runPython("select_best.py", { paths: files, keep });
      winners = result.winners?.length ? result.winners : files.slice(0, keep);
    } catch (err) {
      log(`select_best failed, using first file: ${err.message}`, "warn");
      winners = files.slice(0, keep);
    }
  }

  const rejectDir = ensureRejectedDir();
  const winnerSet = new Set(winners);
  let rejectedCount = 0;
  for (const file of files) {
    if (winnerSet.has(file)) continue;
    if (config.keepRejects) {
      try {
        const dest = join(rejectDir, `${Date.now()}-${basename(file)}`);
        renameSync(file, dest);
        rejectedCount += 1;
        log(
          `Rejected (burst cull, keep ${keep}/${files.length}): ${basename(file)} → ${basename(dest)}`,
          "warn",
        );
      } catch (err) {
        log(`Could not move reject ${basename(file)}: ${err.message}`, "error");
      }
    } else {
      rejectedCount += 1;
      log(`Rejected (burst cull, keep ${keep}/${files.length}): ${basename(file)}`, "warn");
    }
  }
  if (rejectedCount) {
    log(`${rejectedCount} photo(s) rejected · folder: ${REJECTED_DIR}`);
  }

  for (const winner of winners) {
    const path = stageWinner(winner);
    if (path) {
      log(`Staged: ${basename(winner)} → ${basename(path)}`);
      enqueueUpload(path);
    } else {
      log(`Skip missing/unreadable winner: ${basename(winner)}`, "warn");
    }
  }
}

async function processBurst(files) {
  const config = loadConfig();
  if (!files.length) return;

  log(`Burst closed with ${files.length} file(s)`);
  const families = groupBurstFamilies(files, config.burstSeqGap ?? 8);
  if (families.length > 1) {
    log(
      `Split into ${families.length} name families (seq gap ${config.burstSeqGap ?? 8})`,
    );
  }

  for (const family of families) {
    const names = family.map((f) => basename(f)).join(", ");
    if (family.length > 1) {
      log(`Burst family (${family.length}): ${names}`);
    }
    await processBurstFamily(family, config);
  }
}

/**
 * Force-upload a rejected file, skipping burst cull.
 * Stages a copy, enqueues upload, removes reject on success.
 */
export async function forceUploadRejected(name) {
  const src = resolveRejectedFile(name);
  if (!src) throw new Error("Rejected file not found");

  const staged = stageWinner(src);
  if (!staged) throw new Error("Could not stage rejected file");

  log(`Force upload queued: ${basename(src)}`);
  syncUploadConcurrency();

  const result = await uploadQueue.add(async () => {
    try {
      const out = await processStagedPhoto(staged);
      if (!out?.url) throw new Error("Upload failed");
      removeRejectedFile(name);
      log(`Force upload ok, removed reject: ${basename(src)}`);
      return out;
    } catch (err) {
      log(`Force upload failed for ${basename(src)}: ${err.message || err}`, "error");
      throw err;
    }
  });

  return { ok: true, url: result.url, mediaId: result.mediaId };
}

function flushBurstSoon() {
  const config = loadConfig();
  if (burstTimer) clearTimeout(burstTimer);
  burstTimer = setTimeout(() => {
    const batch = [...burstFiles];
    burstFiles = [];
    processBurst(batch).catch((err) => log(err.message, "error"));
  }, config.burstWindowMs || 4000);
}

export async function startWatcher() {
  if (running) return getEngineStatus();
  const config = loadConfig();
  if (!config.watchRoots?.length) {
    throw new Error("No watch folders configured. Open the control UI and add a path.");
  }

  syncUploadConcurrency();

  for (const root of config.watchRoots) {
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
  }

  watcher = chokidar.watch(config.watchRoots, {
    ignored: /(^|[/\\])\../,
    persistent: true,
    ignoreInitial: true,
    depth: config.recursive ? undefined : 0,
    awaitWriteFinish: {
      stabilityThreshold: 400,
      pollInterval: 100,
    },
  });

  watcher.on("add", async (filePath) => {
    const cfg = loadConfig();
    if (!shouldAccept(filePath, cfg)) return;
    const stable = await waitStable(filePath);
    if (!stable) return;
    log(`Detected: ${filePath}`);
    burstFiles.push(filePath);
    flushBurstSoon();
  });

  watcher.on("error", (err) => log(String(err), "error"));
  running = true;
  log(`Watcher started on: ${config.watchRoots.join(", ")}`);
  return getEngineStatus();
}

export async function stopWatcher() {
  if (!running && !watcher) {
    return getEngineStatus();
  }
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  if (burstTimer) clearTimeout(burstTimer);
  burstTimer = null;
  burstFiles = [];
  running = false;
  log("Watcher stopped");
  return getEngineStatus();
}

// CLI entry
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startWatcher().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
