import { spawn } from "node:child_process";
import { platform } from "node:os";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(stderr.trim() || `Folder picker exited with code ${code}`);
        err.code = code;
        reject(err);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function normalizePath(raw) {
  if (!raw) return "";
  let path = raw.replace(/\r?\n/g, "").trim();
  if (path.endsWith("/") && path.length > 1) path = path.slice(0, -1);
  return path;
}

/**
 * Opens a native OS folder picker and returns the absolute path.
 * Returns null if the user cancels.
 */
export async function pickFolder() {
  const os = platform();

  try {
    if (os === "darwin") {
      const out = await run("osascript", [
        "-e",
        'POSIX path of (choose folder with prompt "Select LiveLens watch folder")',
      ]);
      return normalizePath(out) || null;
    }

    if (os === "linux") {
      const out = await run("zenity", ["--file-selection", "--directory", "--title=Select LiveLens watch folder"]);
      return normalizePath(out) || null;
    }

    if (os === "win32") {
      const script = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
        "$d.Description = 'Select LiveLens watch folder'",
        "if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }",
      ].join("; ");
      const out = await run("powershell", ["-NoProfile", "-Command", script]);
      return normalizePath(out) || null;
    }

    throw new Error(`Folder picker is not supported on ${os}`);
  } catch (err) {
    // User cancel: macOS osascript → 1, zenity → 1
    if (err.code === 1) return null;
    throw err;
  }
}
