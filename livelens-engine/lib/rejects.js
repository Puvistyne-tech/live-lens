import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REJECTED_DIR = join(__dirname, "..", "rejected");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"]);

export function ensureRejectedDir() {
  mkdirSync(REJECTED_DIR, { recursive: true });
  return REJECTED_DIR;
}

export function listRejected(limit = 48) {
  ensureRejectedDir();
  const files = readdirSync(REJECTED_DIR)
    .filter((name) => {
      if (name.startsWith(".")) return false;
      return IMAGE_EXTS.has(extname(name).toLowerCase());
    })
    .map((name) => {
      const path = join(REJECTED_DIR, name);
      let mtimeMs = 0;
      let size = 0;
      try {
        const st = statSync(path);
        mtimeMs = st.mtimeMs;
        size = st.size;
      } catch {
        /* ignore */
      }
      return {
        name,
        path,
        size,
        mtimeMs,
        url: `/api/rejects/file?name=${encodeURIComponent(name)}`,
        reason: "Burst cull — not among the kept winners in that drop window",
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);

  return {
    dir: REJECTED_DIR,
    count: files.length,
    files,
  };
}

export function resolveRejectedFile(name) {
  ensureRejectedDir();
  const safe = basename(String(name || ""));
  if (!safe || safe.includes("..")) return null;
  const root = resolve(REJECTED_DIR);
  const full = resolve(join(REJECTED_DIR, safe));
  if (full !== root && !full.startsWith(root + "/")) return null;
  if (!existsSync(full)) return null;
  if (!IMAGE_EXTS.has(extname(full).toLowerCase())) return null;
  return full;
}

export function removeRejectedFile(name) {
  const full = resolveRejectedFile(name);
  if (!full) return false;
  try {
    unlinkSync(full);
    return true;
  } catch {
    return false;
  }
}

export function openRejectedFolder() {
  const dir = ensureRejectedDir();
  const os = platform();
  return new Promise((resolvePromise, reject) => {
    let command;
    let args;
    if (os === "darwin") {
      command = "open";
      args = [dir];
    } else if (os === "win32") {
      command = "explorer";
      args = [dir];
    } else {
      command = "xdg-open";
      args = [dir];
    }
    const proc = spawn(command, args, { stdio: "ignore", detached: true });
    proc.on("error", reject);
    proc.unref();
    resolvePromise({ ok: true, dir });
  });
}
