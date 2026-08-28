"use client";

import { useMemo, useState } from "react";
import { validateInviteCodeAction } from "@/app/actions";
import { detectPrimaryFaceFocal } from "@/lib/face-focal";
import { compressImageFile, isLikelyVideo, validateVideoFile } from "@/lib/media-preprocess";
import type { EventSettings, MediaRow } from "@/lib/types";

type Props = {
  settings: EventSettings;
  role: "guest" | "staff";
  /** Guest contribute page: gallery files only (wish camera is separate). */
  fileOnly?: boolean;
};

type UploadItem = {
  key: string;
  localUrl: string;
  mediaType: "photo" | "video";
  state: "uploading" | "done" | "error";
  error?: string;
  media?: MediaRow;
};

export function MediaUploader({ settings, role, fileOnly = false }: Props) {
  const [name, setName] = useState(role === "staff" ? "Staff" : "");
  const [inviteCode, setInviteCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const needsCode = role === "guest" && settings.guest_upload_mode === "invite_code";
  const accept = useMemo(
    () => "image/jpeg,image/jpg,image/png,image/webp,video/mp4,video/quicktime,video/webm",
    [],
  );

  const moderated =
    role === "guest" && settings.guest_upload_mode === "moderated";

  function patchUpload(key: string, patch: Partial<UploadItem>) {
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  async function onFiles(files: FileList | null, input: HTMLInputElement) {
    if (!files?.length) return;
    const list = Array.from(files);
    input.value = "";

    setBusy(true);
    setStatus(null);
    setProgress({ done: 0, total: list.length });

    const pending: UploadItem[] = list.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      localUrl: URL.createObjectURL(file),
      mediaType: isLikelyVideo(file) ? "video" : "photo",
      state: "uploading",
    }));
    setUploads((prev) => [...pending, ...prev]);

    try {
      if (needsCode) {
        const check = await validateInviteCodeAction(inviteCode);
        if (!check.ok) throw new Error("Invalid or expired invite code");
      }

      let okCount = 0;
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const item = pending[i];
        try {
          const isVideo = isLikelyVideo(file);
          let uploadFile = file;
          let durationMs: number | undefined;
          let focalX: number | undefined;
          let focalY: number | undefined;

          if (isVideo) {
            const meta = await validateVideoFile(file, {
              maxBytes: settings.max_video_bytes,
              maxSeconds: settings.max_video_seconds,
            });
            durationMs = meta.durationMs;
          } else {
            uploadFile = await compressImageFile(file, {
              maxBytes: Math.min(1_200_000, settings.max_photo_bytes),
            });
            if (uploadFile.size > settings.max_photo_bytes) {
              throw new Error("Photo exceeds size limit");
            }
            const focal = await detectPrimaryFaceFocal(uploadFile);
            if (focal) {
              focalX = focal.focal_x;
              focalY = focal.focal_y;
            }
          }

          const form = new FormData();
          form.set("file", uploadFile);
          form.set("role", role);
          form.set("mediaType", isVideo ? "video" : "photo");
          if (name) form.set("uploaderName", name);
          if (inviteCode) form.set("inviteCode", inviteCode);
          if (durationMs != null) form.set("durationMs", String(durationMs));
          if (focalX != null) form.set("focalX", String(focalX));
          if (focalY != null) form.set("focalY", String(focalY));

          const res = await fetch("/api/upload", { method: "POST", body: form });
          const data = (await res.json()) as { error?: string; media?: MediaRow };
          if (!res.ok) throw new Error(data.error || "Upload failed");

          patchUpload(item.key, { state: "done", media: data.media });
          okCount += 1;
        } catch (err) {
          patchUpload(item.key, {
            state: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          });
        }
        setProgress({ done: i + 1, total: list.length });
      }

      if (okCount === list.length) {
        setStatus(
          moderated
            ? "Uploaded — waiting for admin approval"
            : okCount === 1
              ? "Uploaded — it will appear on the live wall soon"
              : `${okCount} uploaded — they will appear on the live wall soon`,
        );
      } else if (okCount > 0) {
        setStatus(`${okCount} of ${list.length} uploaded — some failed`);
      } else {
        setStatus("Upload failed");
      }
    } catch (err) {
      for (const item of pending) {
        patchUpload(item.key, {
          state: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : busy
        ? 8
        : 0;

  return (
    <div className="space-y-5">
      {role === "guest" && (
        <input
          className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base outline-none focus:border-[#c4a574]"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      )}
      {needsCode && (
        <input
          className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base uppercase tracking-widest outline-none focus:border-[#c4a574]"
          placeholder="Invite code"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          disabled={busy}
        />
      )}

      <div className={`grid gap-3 ${fileOnly ? "" : "sm:grid-cols-2"}`}>
        <label
          className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed px-4 py-8 text-center transition ${
            busy
              ? "pointer-events-none border-[#c4a574]/50 bg-[#c4a574]/10"
              : "border-white/25 bg-white/5 hover:border-[#c4a574] hover:bg-white/10"
          }`}
        >
          {busy ? (
            <>
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#c4a574]" />
              <span className="text-base text-[#e8d5b5]">Uploading…</span>
              {progress && (
                <span className="text-xs text-white/55">
                  {progress.done} / {progress.total}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-base">From gallery</span>
              <span className="text-xs text-white/55">JPEG preferred</span>
            </>
          )}
          <input
            type="file"
            accept={accept}
            multiple={role === "staff"}
            className="hidden"
            disabled={busy}
            onChange={(e) => onFiles(e.target.files, e.target)}
          />
        </label>
        {!fileOnly && (
          <label
            className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed px-4 py-8 text-center transition ${
              busy
                ? "pointer-events-none border-[#c4a574]/50 bg-[#c4a574]/10"
                : "border-white/25 bg-white/5 hover:border-[#c4a574] hover:bg-white/10"
            }`}
          >
            {busy ? (
              <>
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#c4a574]" />
                <span className="text-base text-[#e8d5b5]">Uploading…</span>
              </>
            ) : (
              <>
                <span className="text-base">Take photo</span>
                <span className="text-xs text-white/55">Camera · usually JPEG</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={(e) => onFiles(e.target.files, e.target)}
            />
          </label>
        )}
      </div>

      {busy && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-[#c4a574] transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(pct, 6)}%` }}
          />
        </div>
      )}

      <p className="text-xs text-white/45">
        Videos max {settings.max_video_seconds}s. iPhone: Settings → Camera → Formats → Most Compatible
        avoids HEIC issues.
      </p>

      {status && (
        <p
          className={`text-sm ${
            status.toLowerCase().includes("fail") ? "text-[#d77a6d]" : "text-[#e8d5b5]"
          }`}
        >
          {status}
        </p>
      )}

      {uploads.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-white/45">Your uploads</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {uploads.map((u) => {
              const src =
                u.media?.thumb_url || u.media?.preview_url || u.media?.url || u.localUrl;
              return (
                <div
                  key={u.key}
                  className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/40"
                >
                  {u.mediaType === "video" && !u.media?.thumb_url ? (
                    <video
                      src={u.media?.url || u.localUrl}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  )}
                  {u.state === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                      <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-[#c4a574]" />
                    </div>
                  )}
                  {u.state === "done" && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#6fbf8a] px-2 py-0.5 text-[10px] font-medium text-[#0d1a12]">
                      {moderated ? "Pending" : "Live"}
                    </span>
                  )}
                  {u.state === "error" && (
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 to-black/20 p-2">
                      <span className="text-[10px] leading-snug text-[#d77a6d]">
                        {u.error || "Failed"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
