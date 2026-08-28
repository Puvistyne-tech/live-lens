import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "config", "engine.json");

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return {
      watchRoots: [],
      recursive: true,
      extensions: [".jpg", ".jpeg"],
      ignoreRaw: [".cr3", ".arw", ".nef"],
      burstWindowMs: 4000,
      burstKeep: 1,
      burstSeqGap: 8,
      minFileBytes: 20480,
      uploadMaxEdge: 2048,
      uploadJpegQuality: 78,
      aiEnabled: true,
      codeformerWeight: 0.7,
      depthEnabled: true,
      captionEnabled: true,
      tagModels: ["florence2-ft", "moondream2", "smolvlm2"],
      tagTimeoutMs: 180000,
      tagQueueEnabled: true,
      keepRejects: true,
      minIntervalMs: 0,
      processConcurrency: 2,
    };
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

export function saveConfig(config) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export { CONFIG_PATH };
