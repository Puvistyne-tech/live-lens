"use client";

import { useMemo, useRef, useState } from "react";
import { validateInviteCodeAction } from "@/app/actions";
import { VideoTrimSheet } from "@/components/VideoTrimSheet";
import { bakeCollage } from "@/lib/collage";
import { detectPrimaryFaceFocal } from "@/lib/face-focal";
import {
  compressImageFile,
  compressVideoFile,
  getVideoDurationMs,
  isLikelyVideo,
  isVideoTooLong,
} from "@/lib/media-preprocess";
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

const MESSAGE_MAX = 120;

type WorkUnit =
  | { kind: "photo"; file: File; key: string }
  | { kind: "video"; file: File; key: string }
  | { kind: "collage"; files: File[]; key: string };

type TrimRequest = {
  file: File;
  resolve: (value: { file: File; durationMs: number }) => void;
  reject: (reason?: unknown) => void;
};

export function MediaUploader({ settings, role, fileOnly = false }: Props) {
  const [name, setName] = useState(role === "staff" ? "Staff" : "");
  const [message, setMessage] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [trimRequest, setTrimRequest] = useState<TrimRequest | null>(null);
  const trimRequestRef = useRef<TrimRequest | null>(null);

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

  function clearTrimRequest() {
    trimRequestRef.current = null;
    setTrimRequest(null);
  }

  function promptVideoTrim(file: File) {
    return new Promise<{ file: File; durationMs: number }>((resolve, reject) => {
      const req: TrimRequest = { file, resolve, reject };
      trimRequestRef.current = req;
      setTrimRequest(req);
    });
  }

  async function prepareVideo(file: File) {
    const durationMs = await getVideoDurationMs(file);
    if (isVideoTooLong(durationMs, settings.max_video_seconds)) {
      return promptVideoTrim(file);
    }
    return compressVideoFile(file, {
      maxBytes: settings.max_video_bytes,
      maxSeconds: settings.max_video_seconds,
    });
  }

  function buildGuestUnits(list: File[]): WorkUnit[] {
    const photos = list.filter((f) => !isLikelyVideo(f));
    const videos = list.filter((f) => isLikelyVideo(f));
    if (photos.length > 4) {
      throw new Error("You can attach up to 4 photos at once (plus videos separately)");
    }
    const units: WorkUnit[] = [];
    const stamp = Date.now();
    if (photos.length >= 2) {
      units.push({ kind: "collage", files: photos, key: `${stamp}-collage` });
    } else if (photos.length === 1) {
      units.push({ kind: "photo", file: photos[0], key: `${stamp}-0-${photos[0].name}` });
    }
    videos.forEach((file, i) => {
      units.push({ kind: "video", file, key: `${stamp}-v${i}-${file.name}` });
    });
    return units;
  }

  function buildStaffUnits(list: File[]): WorkUnit[] {
    const stamp = Date.now();
    return list.map((file, i) =>
      isLikelyVideo(file)
        ? { kind: "video" as const, file, key: `${stamp}-${i}-${file.name}` }
        : { kind: "photo" as const, file, key: `${stamp}-${i}-${file.name}` },
    );
  }

  async function uploadOne(opts: {
    uploadFile: File;
    mediaType: "photo" | "video";
    key: string;
    durationMs?: number;
    focalX?: number;
    focalY?: number;
  }) {
    const form = new FormData();
    form.set("file", opts.uploadFile);
    form.set("role", role);
    form.set("mediaType", opts.mediaType);
    if (name) form.set("uploaderName", name);
    if (role === "guest" && message.trim()) {
      form.set("caption", message.trim().slice(0, MESSAGE_MAX));
    }
    if (inviteCode) form.set("inviteCode", inviteCode);
    if (opts.durationMs != null) form.set("durationMs", String(opts.durationMs));
    if (opts.focalX != null) form.set("focalX", String(opts.focalX));
    if (opts.focalY != null) form.set("focalY", String(opts.focalY));

    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = (await res.json()) as { error?: string; media?: MediaRow };
    if (!res.ok) throw new Error(data.error || "Upload failed");
    patchUpload(opts.key, { state: "done", media: data.media });
  }

  async function onFiles(files: FileList | null, input: HTMLInputElement) {
    if (!files?.length) return;
    const list = Array.from(files);
    input.value = "";

    setBusy(true);
    setStatus(null);

    let units: WorkUnit[];
    try {
      units = role === "guest" ? buildGuestUnits(list) : buildStaffUnits(list);
    } catch (err) {
      setBusy(false);
      setStatus(err instanceof Error ? err.message : "Upload failed");
      return;
    }

    if (units.length === 0) {
      setBusy(false);
      setStatus("No supported files selected");
      return;
    }

    setProgress({ done: 0, total: units.length });

    const pending: UploadItem[] = units.map((u) => {
      if (u.kind === "collage") {
        return {
          key: u.key,
          localUrl: URL.createObjectURL(u.files[0]),
          mediaType: "photo" as const,
          state: "uploading" as const,
        };
      }
      return {
        key: u.key,
        localUrl: URL.createObjectURL(u.file),
        mediaType: u.kind === "video" ? ("video" as const) : ("photo" as const),
        state: "uploading" as const,
      };
    });
    setUploads((prev) => [...pending, ...prev]);

    try {
      if (needsCode) {
        const check = await validateInviteCodeAction(inviteCode);
        if (!check.ok) throw new Error("Invalid or expired invite code");
      }

      let okCount = 0;
      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        try {
          if (unit.kind === "collage") {
            const baked = await bakeCollage(unit.files);
            let uploadFile = await compressImageFile(baked, {
              maxBytes: Math.min(1_200_000, settings.max_photo_bytes),
            });
            if (uploadFile.size > settings.max_photo_bytes) {
              throw new Error("Photo exceeds size limit");
            }
            // Refresh local preview with collage
            const collageUrl = URL.createObjectURL(uploadFile);
            patchUpload(unit.key, { localUrl: collageUrl });
            await uploadOne({ uploadFile, mediaType: "photo", key: unit.key });
          } else if (unit.kind === "video") {
            const prepared = await prepareVideo(unit.file);
            const preview = URL.createObjectURL(prepared.file);
            patchUpload(unit.key, { localUrl: preview });
            await uploadOne({
              uploadFile: prepared.file,
              mediaType: "video",
              key: unit.key,
              durationMs: prepared.durationMs,
            });
          } else {
            let uploadFile = await compressImageFile(unit.file, {
              maxBytes: Math.min(1_200_000, settings.max_photo_bytes),
            });
            if (uploadFile.size > settings.max_photo_bytes) {
              throw new Error("Photo exceeds size limit");
            }
            let focalX: number | undefined;
            let focalY: number | undefined;
            const focal = await detectPrimaryFaceFocal(uploadFile);
            if (focal) {
              focalX = focal.focal_x;
              focalY = focal.focal_y;
            }
            await uploadOne({
              uploadFile,
              mediaType: "photo",
              key: unit.key,
              focalX,
              focalY,
            });
          }
          okCount += 1;
        } catch (err) {
          patchUpload(unit.key, {
            state: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          });
        }
        setProgress({ done: i + 1, total: units.length });
      }

      if (okCount === units.length) {
        setStatus(
          moderated
            ? "Uploaded — waiting for admin approval"
            : okCount === 1
              ? "Uploaded — it will appear on the live wall soon"
              : `${okCount} uploaded — they will appear on the live wall soon`,
        );
      } else if (okCount > 0) {
        setStatus(`${okCount} of ${units.length} uploaded — some failed`);
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
      clearTrimRequest();
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
      {trimRequest && (
        <VideoTrimSheet
          file={trimRequest.file}
          maxSeconds={Math.max(1, settings.max_video_seconds || 10)}
          maxBytes={settings.max_video_bytes}
          onCancel={() => {
            trimRequest.reject(new Error("Trim cancelled"));
            clearTrimRequest();
          }}
          onDone={(result) => {
            trimRequest.resolve(result);
            clearTrimRequest();
          }}
        />
      )}
      {role === "guest" && (
        <>
          <input
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base outline-none focus:border-[#c4a574]"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <div>
            <textarea
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base outline-none focus:border-[#c4a574]"
              rows={3}
              maxLength={MESSAGE_MAX}
              placeholder="Message (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
              disabled={busy}
            />
            <p className="mt-1 text-right text-xs text-white/40">
              {message.length}/{MESSAGE_MAX}
            </p>
          </div>
        </>
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
              <span className="text-base text-[#e8d5b5]">
                {trimRequest ? "Trim video…" : "Uploading…"}
              </span>
              {progress && (
                <span className="text-xs text-white/55">
                  {progress.done} / {progress.total}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-base">From gallery</span>
              <span className="text-xs text-white/55">
                {role === "guest" ? "Up to 4 photos · videos OK" : "JPEG preferred"}
              </span>
            </>
          )}
          <input
            type="file"
            accept={accept}
            multiple
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
        Videos max {settings.max_video_seconds}s — longer clips can be trimmed. iPhone: Settings →
        Camera → Formats → Most Compatible avoids HEIC issues.
      </p>

      {status && (
        <p
          className={`text-sm ${
            status.toLowerCase().includes("fail") || status.toLowerCase().includes("up to 4")
              ? "text-[#d77a6d]"
              : "text-[#e8d5b5]"
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
