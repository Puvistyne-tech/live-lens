"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { validateInviteCodeAction } from "@/app/actions";
import { compressImageFile } from "@/lib/media-preprocess";
import type { EventSettings, MediaRow } from "@/lib/types";

type Phase = "camera" | "review" | "done";
type Facing = "user" | "environment";

type Props = {
  settings: EventSettings;
};

const LONG_PRESS_MS = 320;
const MESSAGE_MAX = 120;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export function WishCamera({ settings }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordStartedAtRef = useRef(0);
  const recordedDurationMsRef = useRef(0);
  const maxMsRef = useRef(settings.max_video_seconds * 1000);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("camera");
  const [facing, setFacing] = useState<Facing>("user");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"photo" | "video">("photo");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const needsCode = settings.guest_upload_mode === "invite_code";
  const maxSeconds = Math.max(1, settings.max_video_seconds || 10);
  maxMsRef.current = maxSeconds * 1000;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(
    async (face: Facing) => {
      setCameraError(null);
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: { ideal: face },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        setCameraError("Camera access is required to send a wish. Allow permission and retry.");
      }
    },
    [stopStream],
  );

  useEffect(() => {
    if (phase !== "camera") return;
    // Camera stream is an external system; startCamera updates error/UI state after getUserMedia.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional camera lifecycle
    void startCamera(facing);
    return () => stopStream();
  }, [phase, facing, startCamera, stopStream]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function clearPressTimer() {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  function clearStopTimer() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }

  function goToReview(nextBlob: Blob, type: "photo" | "video") {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(nextBlob);
    setMediaType(type);
    setPreviewUrl(URL.createObjectURL(nextBlob));
    setPhase("review");
    setRecording(false);
    setRecordProgress(0);
    recordingRef.current = false;
    stopStream();
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    const photoBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (photoBlob) goToReview(photoBlob, "photo");
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") return;
    const mime = pickMimeType();
    chunksRef.current = [];
    try {
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        clearStopTimer();
        const type = recorder.mimeType || mime || "video/webm";
        const videoBlob = new Blob(chunksRef.current, { type });
        if (videoBlob.size > 0) goToReview(videoBlob, "video");
        else {
          setRecording(false);
          recordingRef.current = false;
          setRecordProgress(0);
        }
      };
      recordStartedAtRef.current = Date.now();
      recordingRef.current = true;
      setRecording(true);
      setRecordProgress(0);
      recorder.start(200);
      stopTimerRef.current = setTimeout(() => stopRecording(), maxMsRef.current);
      const tick = () => {
        if (!recordingRef.current) return;
        const elapsed = Date.now() - recordStartedAtRef.current;
        setRecordProgress(Math.min(1, elapsed / maxMsRef.current));
        if (elapsed < maxMsRef.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setStatus("Recording is not supported on this browser.");
    }
  }

  function stopRecording() {
    clearStopTimer();
    if (recordingRef.current && recordStartedAtRef.current) {
      recordedDurationMsRef.current = Math.min(
        Date.now() - recordStartedAtRef.current,
        maxMsRef.current,
      );
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recordingRef.current = false;
  }

  function onPointerDown() {
    if (busy || phase !== "camera" || cameraError) return;
    setPressing(true);
    clearPressTimer();
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      startRecording();
    }, LONG_PRESS_MS);
  }

  function onPointerUp() {
    setPressing(false);
    if (pressTimerRef.current) {
      clearPressTimer();
      void capturePhoto();
      return;
    }
    if (recordingRef.current) stopRecording();
  }

  function onPointerLeave() {
    if (pressing && !recordingRef.current) {
      setPressing(false);
      clearPressTimer();
    }
  }

  function retry() {
    setStatus(null);
    setBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setMessage("");
    setPhase("camera");
  }

  async function sendWish() {
    if (!blob || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      if (!settings.guest_upload_enabled) throw new Error("Guest upload is disabled");
      if (needsCode) {
        const check = await validateInviteCodeAction(inviteCode);
        if (!check.ok) throw new Error("Invalid or expired invite code");
      }

      let uploadFile: File;
      let durationMs: number | undefined;

      if (mediaType === "video") {
        if (blob.size > settings.max_video_bytes) {
          throw new Error("Video exceeds size limit");
        }
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        uploadFile = new File([blob], `wish.${ext}`, { type: blob.type || `video/${ext}` });
        durationMs = recordedDurationMsRef.current || maxSeconds * 1000;
        if (previewUrl) {
          durationMs = await new Promise<number>((resolve) => {
            const v = document.createElement("video");
            v.preload = "metadata";
            v.onloadedmetadata = () => {
              const ms = Math.round((Number.isFinite(v.duration) ? v.duration : maxSeconds) * 1000);
              resolve(Math.min(ms || durationMs!, maxSeconds * 1000));
            };
            v.onerror = () => resolve(durationMs!);
            v.src = previewUrl;
          });
        }
      } else {
        const raw = new File([blob], "wish.jpg", { type: "image/jpeg" });
        uploadFile = await compressImageFile(raw, {
          maxBytes: Math.min(1_200_000, settings.max_photo_bytes),
        });
      }

      const form = new FormData();
      form.set("file", uploadFile);
      form.set("role", "guest");
      form.set("mediaType", mediaType);
      form.set("tag", "wish");
      form.set("caption", message.trim().slice(0, MESSAGE_MAX));
      if (name.trim()) form.set("uploaderName", name.trim());
      if (inviteCode) form.set("inviteCode", inviteCode);
      if (durationMs != null) form.set("durationMs", String(durationMs));

      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; media?: MediaRow };
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setPhase("done");
      setStatus(
        settings.guest_upload_mode === "moderated" ||
          (settings.guest_upload_mode === "invite_code" && !data.media?.approved)
          ? "Wish sent — waiting for approval"
          : "Wish sent — find it in Gallery → Wishes",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const ring = `conic-gradient(#c4a574 ${recordProgress * 360}deg, rgba(255,255,255,0.2) 0)`;

  if (!settings.guest_upload_enabled) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0d0f14] px-5 text-center text-[#f2f0ea]">
        <Link href="/" className="text-sm uppercase tracking-[0.22em] text-[#c4a574]">
          LiveLens
        </Link>
        <p className="mt-6 text-white/60">Guest wishes are turned off right now.</p>
        <Link href="/" className="mt-6 text-[#e8d5b5] underline-offset-2 hover:underline">
          Back home
        </Link>
      </main>
    );
  }

  if (phase === "done") {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0d0f14] px-5 text-center text-[#f2f0ea]">
        <Link href="/" className="text-sm uppercase tracking-[0.22em] text-[#c4a574]">
          LiveLens
        </Link>
        <h1 className="mt-8 font-[family-name:var(--font-display)] text-4xl">Thank you</h1>
        <p className="mt-3 max-w-sm text-white/65">{status}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="rounded-full bg-[#c4a574] px-5 py-3 text-[#1a140c]"
            onClick={retry}
          >
            Send another
          </button>
          <Link
            href="/gallery"
            className="rounded-full border border-white/25 px-5 py-3 text-white/90"
          >
            View gallery
          </Link>
        </div>
      </main>
    );
  }

  if (phase === "review" && previewUrl) {
    return (
      <main className="relative flex min-h-[100dvh] flex-col bg-[#0d0f14] text-[#f2f0ea]">
        <div className="absolute left-4 top-4 z-20">
          <Link href="/" className="text-sm uppercase tracking-[0.22em] text-[#c4a574]">
            LiveLens
          </Link>
        </div>
        <div className="relative mx-auto mt-14 w-full max-w-lg flex-1 px-4">
          <div className="overflow-hidden rounded-2xl bg-black">
            {mediaType === "video" ? (
              <video
                src={previewUrl}
                className="aspect-[3/4] w-full object-cover"
                playsInline
                muted
                loop
                autoPlay
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="aspect-[3/4] w-full object-cover" />
            )}
          </div>
          <div className="mt-4 space-y-3 pb-10">
            <input
              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 outline-none focus:border-[#c4a574]"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            {needsCode && (
              <input
                className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 uppercase tracking-widest outline-none focus:border-[#c4a574]"
                placeholder="Invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                disabled={busy}
              />
            )}
            <textarea
              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 outline-none focus:border-[#c4a574]"
              rows={3}
              maxLength={MESSAGE_MAX}
              placeholder="Wish for the couple…"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
              disabled={busy}
            />
            <p className="text-right text-xs text-white/40">
              {message.length}/{MESSAGE_MAX}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-full border border-white/25 py-3"
                onClick={retry}
                disabled={busy}
              >
                Retry
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-[#c4a574] py-3 text-[#1a140c] disabled:opacity-50"
                onClick={() => void sendWish()}
                disabled={busy}
              >
                {busy ? "Sending…" : "Send wish"}
              </button>
            </div>
            {status && <p className="text-sm text-[#d77a6d]">{status}</p>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-black text-white">
      <div className="absolute left-4 top-4 z-20 flex items-center gap-3">
        <Link href="/" className="text-sm uppercase tracking-[0.22em] text-[#c4a574]">
          LiveLens
        </Link>
      </div>
      <button
        type="button"
        className="absolute right-4 top-4 z-20 rounded-full border border-white/25 bg-black/40 px-3 py-1.5 text-sm backdrop-blur"
        onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
      >
        Flip
      </button>

      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover ${facing === "user" ? "scale-x-[-1]" : ""}`}
        playsInline
        muted
        autoPlay
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="absolute inset-x-0 bottom-10 z-20 flex flex-col items-center gap-3">
        <p className="text-sm text-white/70">
          {recording
            ? `Recording… ${Math.max(0, Math.ceil(maxSeconds * (1 - recordProgress)))}s`
            : "Tap for photo · hold for video"}
        </p>
        {cameraError ? (
          <p className="max-w-xs text-center text-sm text-[#d77a6d]">{cameraError}</p>
        ) : (
          <button
            type="button"
            aria-label={recording ? "Stop recording" : "Capture"}
            className={`relative flex h-[76px] w-[76px] items-center justify-center rounded-full transition-transform ${
              pressing || recording ? "scale-95" : "scale-100"
            }`}
            style={{ background: recording ? ring : undefined }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              onPointerDown();
            }}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
          >
            <span
              className={`block rounded-full border-4 border-white/90 ${
                recording ? "h-10 w-10 bg-[#c4a574]" : "h-16 w-16 bg-white/90"
              } transition-all`}
            />
          </button>
        )}
        {status && <p className="text-sm text-[#d77a6d]">{status}</p>}
      </div>
    </main>
  );
}
