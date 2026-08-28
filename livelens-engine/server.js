import "dotenv/config";
import { createServer } from "node:http";
import { createReadStream, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, saveConfig } from "./lib/config.js";
import { pickFolder } from "./lib/pick-folder.js";
import { listRejected, openRejectedFolder, resolveRejectedFile } from "./lib/rejects.js";
import { getEngineStatus, startWatcher, stopWatcher, forceUploadRejected } from "./watcher.js";
import { startTagQueue, stopTagQueue } from "./tag-queue.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CONTROL_PORT || 3847);

const HOST_FTP_SETUP = `A. HOST PC — FTP SERVER (Mac or Windows — do this first)
══════════════════════════════════════
LiveLens Engine runs on the same computer that receives camera FTP uploads.

1. Create a drop folder:
   • macOS:   /Users/YOU/WeddingPhotos/FTP_Drop/<camera>
   • Windows: C:\\WeddingPhotos\\FTP_Drop\\<camera>
2. In LiveLens Engine: Select folder → add that path → Save.
3. Install an FTP server on this computer:
   • macOS: QuickFTP, CrushFTP, or FileZilla Server
   • Windows: FileZilla Server (recommended), CrushFTP, or QuickFTP if available
4. Typical FTP server settings (any OS):
   • Port: 21 (or 2121 if 21 needs admin / is blocked)
   • Root / share folder = the same FTP_Drop path you added above
   • Username + password (you will enter these on the camera)
   • Passive mode (PASV): ON — required on most venue / home Wi‑Fi routers
   • Allow write / upload: ON
5. Find this computer’s LAN IP (camera will use this as “FTP server”):
   • macOS: System Settings → Network → Wi‑Fi → Details → IP Address
   • Windows: Settings → Network & internet → Wi‑Fi → (your network) → Properties
     → IPv4 address
     Or: open Command Prompt → ipconfig → look for “IPv4 Address”
   Example: 192.168.1.42
6. This PC + camera must be on the SAME Wi‑Fi / LAN.
   Avoid “Guest” networks that isolate clients from each other.
7. Firewall — allow the FTP app (and port 21 / your port):
   • macOS: System Settings → Network → Firewall → Options → allow the FTP app
   • Windows: Windows Security → Firewall → Allow an app → check your FTP server
     (Private networks ON). If using a custom port, allow inbound TCP for that port.
8. Prevent sleep while shooting (Wi‑Fi drops when the PC sleeps):
   • macOS: System Settings → Battery / Energy → prevent automatic sleep on power adapter
   • Windows: Settings → System → Power → Screen and sleep → Never (while plugged in)
9. Click Start watcher in LiveLens BEFORE testing the camera.`;

const PRESETS = {
  canon_r8: {
    label: "Canon EOS R8",
    tip: "JPEG-only FTP → drop folder. Ignore .CR3. Recursive watch ON. Host: Mac or Windows.",
    guide: `CANON EOS R8 — FTP SETUP (DETAILED)

══════════════════════════════════════
${HOST_FTP_SETUP.replaceAll("<camera>", "canon")}

══════════════════════════════════════
B. CAMERA — CONNECT TO Wi‑Fi
══════════════════════════════════════
1. Menu → Network settings (or Wireless communication)
2. Wi‑Fi → Enable
3. Connect to the same SSID as the host PC (WPA2/WPA3 password)
4. Confirm the camera gets a DHCP IP on the same subnet as the PC
   (e.g. PC 192.168.1.42 → camera 192.168.1.xx)

══════════════════════════════════════
C. CAMERA — FTP TRANSFER SETTINGS
══════════════════════════════════════
1. Menu → Network settings → FTP transfer (or Transfer images → FTP)
2. Create / edit an FTP server profile:
   • Server address: host PC LAN IP (e.g. 192.168.1.42)
   • Port: same as FTP app (usually 21)
   • Login / Username: as set on the host FTP server
   • Password: as set on the host FTP server
   • Passive mode / PASV: ON (recommended)
   • Target folder: /canon  or leave root if FTP root IS the drop folder
3. Directory / folder structure:
   • Prefer a dedicated subfolder (canon/) so staff/guest files stay separate
   • If Canon writes DCIM-like trees, keep Recursive watch ON in LiveLens
4. Image type to send:
   • Set still image recording to JPEG, OR
   • FTP: send JPEG only (do NOT upload CR3 RAW over Wi‑Fi)
5. Auto transfer / Transfer with card:
   • Enable automatic transfer after each shot (or after burst)
   • Test with 1 frame first

══════════════════════════════════════
D. LIVELENS ENGINE CHECKLIST
══════════════════════════════════════
• Preset applied: extensions .jpg/.jpeg, ignore .CR3, recursive ON
• Watch folder points at the FTP root (or the canon/ subfolder)
• Start watcher → shoot one JPEG → watch Live log for Detected / Uploaded
• If nothing appears: file may be RAW-only, unstable write, wrong folder, or FTP root mismatch

══════════════════════════════════════
E. COMMON FAILURES
══════════════════════════════════════
• Camera on venue “Guest” Wi‑Fi that blocks LAN → use private SSID
• Wrong IP after PC sleeps / DHCP renew → recheck IP on Mac or Windows, update camera
• Windows Firewall blocking FileZilla Server → allow on Private networks
• Active FTP mode blocked by router → force Passive/PASV
• Watching parent folder but camera writes to a sibling path → fix Target folder
• HEIC/RAW only on card → force JPEG recording for FTP`,
    patch: {
      extensions: [".jpg", ".jpeg"],
      ignoreRaw: [".cr3", ".CR3"],
      recursive: true,
    },
  },
  sony_a7iv: {
    label: "Sony A7 IV",
    tip: "FTP Transfer Func → Standard hierarchy + sony/ folder. Ignore .ARW. Host: Mac or Windows.",
    guide: `SONY A7 IV — FTP SETUP (DETAILED)

══════════════════════════════════════
${HOST_FTP_SETUP.replaceAll("<camera>", "sony")}

══════════════════════════════════════
B. CAMERA — Wi‑Fi + NETWORK
══════════════════════════════════════
1. Menu → Network → Wi‑Fi / Access Point Settings
2. Connect to the venue/private SSID (same as the host PC)
3. Confirm IP / subnet matches the PC’s LAN
4. Optional: assign a static IP on camera if DHCP is flaky at venues

══════════════════════════════════════
C. CAMERA — FTP TRANSFER FUNCTION
══════════════════════════════════════
Path is typically:
Menu → Network → FTP Transfer Func. (or Transfer / FTP)

1. FTP Transfer Func. → On
2. Server Setting → Register New / Edit:
   • Destination Host: host PC IP (e.g. 192.168.1.42)
   • Port Number: 21 (match FTP app)
   • Directory Hierarchy: Standard (recommended)
   • Specify Directory / Destination Folder: sony
     → Writes under …/sony/ on the host share
   • User / Password: match host FTP server
   • Passive Mode: On
3. Still Image File Format for transfer:
   • Prefer JPEG (or “JPEG only”) — do not push ARW over Wi‑Fi mid-ceremony
   • In camera: File Format JPEG, or RAW+JPEG with FTP set to JPEG only if available
4. Auto FTP Transfer:
   • Set Auto FTP Transfer → On (or transfer after shoot)
   • Transfer Status / Power Save: keep camera awake while transferring
5. Same as Camera / Directory options:
   • If using “Same as Camera” folder trees, leave LiveLens Recursive watch ON

══════════════════════════════════════
D. LIVELENS ENGINE CHECKLIST
══════════════════════════════════════
• Preset applied: .jpg/.jpeg, ignore .ARW, recursive ON
• Watch either FTP_Drop (recursive) or the explicit sony/ folder
• Start watcher → take one JPEG → Live log shows Detected → Uploaded
• Depth + Florence run after enhance (first run downloads models — be patient)

══════════════════════════════════════
E. COMMON FAILURES
══════════════════════════════════════
• Directory Hierarchy “Camera” creates deep DCIM paths — recursive must stay ON
• Specify Directory typo (Sony vs sony) → empty watch folder
• FTP over VPN / phone hotspot that isolates devices
• PC sleeps and drops Wi‑Fi → disable sleep on power adapter (Mac or Windows)
• Windows: FileZilla not allowed through firewall on Private network
• Transfer stuck: check FTP server logs + camera FTP error code (auth / PASV / path)`,
    patch: {
      extensions: [".jpg", ".jpeg"],
      ignoreRaw: [".arw", ".ARW"],
      recursive: true,
    },
  },
  nikon_z8: {
    label: "Nikon Z8",
    tip: "Pre-create nikon/ on FTP. Auto upload JPEG only. Ignore .NEF. Host: Mac or Windows.",
    guide: `NIKON Z8 — FTP SETUP (DETAILED)

══════════════════════════════════════
${HOST_FTP_SETUP.replaceAll("<camera>", "nikon")}

IMPORTANT for Nikon: the destination folder must already exist on disk
BEFORE the camera connects (create nikon/ inside FTP_Drop first).

══════════════════════════════════════
B. CAMERA — CONNECT NETWORK
══════════════════════════════════════
1. Menu → Network menu / Connect to network
2. Wi‑Fi → Connect to the same SSID as the host PC
3. Confirm IP is on the same subnet

══════════════════════════════════════
C. CAMERA — FTP / AUTO UPLOAD
══════════════════════════════════════
Menus vary slightly by firmware; look under Network / Connect to FTP server / Upload.

1. Choose Connect to FTP server → New profile:
   • Address: host PC IP
   • Port: match FTP app
   • Folder: nikon   (must already exist on the host share)
   • User / Password: host FTP credentials
   • PASV / Passive: On when available
2. Upload settings:
   • Auto upload: ON
   • Upload RAW+JPEG As → JPEG only (critical — do not flood NEF over Wi‑Fi)
   • If option exists: upload after each shot / when buffer free
3. Image quality on camera:
   • JPEG fine (or RAW+JPEG with FTP JPEG-only) for ceremony coverage
4. Test: shoot one frame → confirm file appears in …/FTP_Drop/nikon on the PC

══════════════════════════════════════
D. LIVELENS ENGINE CHECKLIST
══════════════════════════════════════
• Preset applied: .jpg/.jpeg, ignore .NEF, recursive ON
• Watch folder includes nikon/ (or parent with recursive)
• Live log: Detected → (enhance) → (depth/caption) → Uploaded
• If Nikon refuses to connect: folder missing on server is the #1 cause

══════════════════════════════════════
E. COMMON FAILURES
══════════════════════════════════════
• Destination folder not pre-created → FTP connect/upload fails
• Uploading NEF → huge files, timeout, or ignored by LiveLens extensions
• Camera on 5 GHz guest SSID with client isolation
• Wrong port / auth after changing FTP server password
• Windows Firewall blocking inbound FTP
• Watcher started on empty path while files land elsewhere — verify exact FTP root`,
    patch: {
      extensions: [".jpg", ".jpeg"],
      ignoreRaw: [".nef", ".NEF"],
      recursive: true,
    },
  },
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function serveStatic(res, path) {
  if (!existsSync(path)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = extname(path);
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
  res.writeHead(200, { "Content-Type": types[ext] || "text/plain" });
  res.end(readFileSync(path));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    if (url.pathname === "/api/status" && req.method === "GET") {
      const rejects = listRejected(24);
      return sendJson(res, 200, {
        config: loadConfig(),
        status: getEngineStatus(),
        presets: PRESETS,
        rejects,
      });
    }

    if (url.pathname === "/api/rejects" && req.method === "GET") {
      return sendJson(res, 200, listRejected(48));
    }

    if (url.pathname === "/api/rejects/open" && req.method === "POST") {
      const result = await openRejectedFolder();
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/rejects/force-upload" && req.method === "POST") {
      const body = await readBody(req);
      const name = body?.name;
      if (!name) return sendJson(res, 400, { error: "Missing name" });
      const result = await forceUploadRejected(name);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/rejects/file" && req.method === "GET") {
      const filePath = resolveRejectedFile(url.searchParams.get("name"));
      if (!filePath) return sendJson(res, 404, { error: "Not found" });
      const ext = extname(filePath).toLowerCase();
      const types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".heic": "image/heic",
      };
      const st = statSync(filePath);
      res.writeHead(200, {
        "Content-Type": types[ext] || "application/octet-stream",
        "Content-Length": st.size,
        "Cache-Control": "no-store",
      });
      createReadStream(filePath).pipe(res);
      return;
    }

    if (url.pathname === "/api/config" && req.method === "POST") {
      const body = await readBody(req);
      const current = loadConfig();
      const next = { ...current, ...body };
      saveConfig(next);
      return sendJson(res, 200, { ok: true, config: next });
    }

    if (url.pathname === "/api/preset" && req.method === "POST") {
      const body = await readBody(req);
      const preset = PRESETS[body.id];
      if (!preset) return sendJson(res, 400, { error: "Unknown preset" });
      const current = loadConfig();
      const next = { ...current, ...preset.patch };
      saveConfig(next);
      return sendJson(res, 200, {
        ok: true,
        config: next,
        tip: preset.tip,
        guide: preset.guide || preset.tip,
        label: preset.label,
      });
    }

    if (url.pathname === "/api/start" && req.method === "POST") {
      const status = await startWatcher();
      startTagQueue().catch((err) => console.warn("[tag-queue]", err.message));
      return sendJson(res, 200, { ok: true, status });
    }

    if (url.pathname === "/api/stop" && req.method === "POST") {
      const status = await stopWatcher();
      await stopTagQueue().catch(() => {});
      return sendJson(res, 200, { ok: true, status });
    }

    if (url.pathname === "/api/pick-folder" && req.method === "POST") {
      const path = await pickFolder();
      if (!path) return sendJson(res, 200, { ok: false, cancelled: true });
      return sendJson(res, 200, { ok: true, path });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveStatic(res, join(__dirname, "ui", "index.html"));
    }

    if (url.pathname.startsWith("/ui/")) {
      return serveStatic(res, join(__dirname, url.pathname.slice(1)));
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { error: err.message || String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`LiveLens engine control UI: http://127.0.0.1:${PORT}`);
});
