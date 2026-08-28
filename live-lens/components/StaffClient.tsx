"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "@/app/actions";
import { MediaUploader } from "@/components/MediaUploader";
import type { EventSettings } from "@/lib/types";

export function StaffClient({
  settings,
  initiallyAuthed,
}: {
  settings: EventSettings;
  initiallyAuthed: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(initiallyAuthed);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const staffSettings: EventSettings = {
    ...settings,
    max_photo_bytes: Math.max(settings.max_photo_bytes, 8_000_000),
    max_video_bytes: Math.max(settings.max_video_bytes, 40_000_000),
    max_video_seconds: Math.max(settings.max_video_seconds, 8),
  };

  return (
    <main className="min-h-[100dvh] bg-[#12141a] px-5 py-10 text-[#f2f0ea]">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="text-sm uppercase tracking-[0.28em] text-[#c4a574]">
          LiveLens
        </Link>
        <p className="mt-4 text-sm uppercase tracking-[0.28em] text-white/45">Staff</p>
        <h1 className="mt-2 text-4xl">Dedicated upload</h1>
        <p className="mt-3 text-white/60">
          For linked phones or PC — pick from gallery or camera. Uploads go live immediately.
        </p>

        {!authed ? (
          <form
            className="mt-8 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await loginAction("staff", password);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setAuthed(true);
                setError(null);
                router.refresh();
              });
            }}
          >
            <input
              type="password"
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 outline-none focus:border-[#c4a574]"
              placeholder="Staff password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              disabled={pending}
              className="rounded-full bg-[#c4a574] px-5 py-3 text-[#1a140c] disabled:opacity-60"
            >
              {pending ? "…" : "Sign in"}
            </button>
            {error && <p className="text-sm text-[#d77a6d]">{error}</p>}
          </form>
        ) : (
          <div className="mt-8">
            <MediaUploader settings={staffSettings} role="staff" />
          </div>
        )}
      </div>
    </main>
  );
}
