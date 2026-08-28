"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createUploadCodeAction,
  deleteMediaAction,
  deleteUploadCodeAction,
  loginAction,
  logoutAction,
  setMediaApprovedAction,
  updateSettingsAction,
} from "@/app/actions";
import type { EventSettings, GuestUploadMode, MediaRow, UploadCode } from "@/lib/types";

type Props = {
  initiallyAuthed: boolean;
  settings: EventSettings;
  media: MediaRow[];
  codes: UploadCode[];
};

function MediaCard({
  item,
  pending,
  start,
  router,
}: {
  item: MediaRow;
  pending: boolean;
  start: (fn: () => void) => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
      {item.media_type === "video" ? (
        <video src={item.url} className="aspect-square w-full object-cover" muted playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumb_url || item.preview_url || item.url}
          alt=""
          className="aspect-square w-full object-cover"
        />
      )}
      <div className="space-y-2 p-2 text-xs">
        <p className="truncate text-white/70">
          {item.source}
          {item.tag === "wish" ? " · wish" : ""} · {item.approved ? "live" : "pending"}
        </p>
        <div className="flex flex-wrap gap-1">
          <button
            className="rounded-full bg-[#c4a574] px-2 py-1 text-[#1a140c]"
            disabled={pending}
            onClick={() =>
              start(() => {
                void (async () => {
                  await setMediaApprovedAction(item.id, !item.approved);
                  router.refresh();
                })();
              })
            }
          >
            {item.approved ? "Hide" : "Approve"}
          </button>
          <button
            className="rounded-full border border-white/20 px-2 py-1"
            disabled={pending}
            onClick={() =>
              start(() => {
                void (async () => {
                  await deleteMediaAction(item.id);
                  router.refresh();
                })();
              })
            }
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export function AdminClient({ initiallyAuthed, settings, media, codes }: Props) {
  const router = useRouter();
  const [authed, setAuthed] = useState(initiallyAuthed);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [localSettings, setLocalSettings] = useState(settings);
  const [codeDigits, setCodeDigits] = useState("");
  const [hours, setHours] = useState(6);
  const [autoApprove, setAutoApprove] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [heroMsg, setHeroMsg] = useState<string | null>(null);

  const pendingMedia = useMemo(() => media.filter((m) => !m.approved), [media]);
  const approvedMedia = useMemo(() => media.filter((m) => m.approved), [media]);

  const prefix = (localSettings.invite_code_prefix ?? "").trim();
  const previewCode = `${prefix}${codeDigits}`.toUpperCase();

  function randomDigits() {
    const used = new Set(codes.map((c) => c.code.toUpperCase()));
    for (let i = 0; i < 40; i++) {
      const dig = String(Math.floor(1000 + Math.random() * 9000));
      const full = `${prefix}${dig}`.toUpperCase();
      if (!used.has(full)) {
        setCodeDigits(dig);
        return;
      }
    }
    setCodeDigits(String(Math.floor(1000 + Math.random() * 9000)));
  }

  async function onHeroFile(file: File | null) {
    if (!file) return;
    setHeroBusy(true);
    setHeroMsg(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/hero", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.url) {
        setLocalSettings((s) => ({ ...s, hero_image_url: data.url! }));
        setHeroMsg("Hero image uploaded");
        router.refresh();
      }
    } catch (err) {
      setHeroMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setHeroBusy(false);
    }
  }

  if (!authed) {
    return (
      <main className="min-h-[100dvh] bg-[#12141a] px-5 py-10 text-[#f2f0ea]">
        <div className="mx-auto max-w-md">
          <Link href="/" className="text-sm uppercase tracking-[0.28em] text-[#c4a574]">
            LiveLens
          </Link>
          <p className="mt-4 text-sm uppercase tracking-[0.28em] text-white/45">Admin</p>
          <h1 className="mt-2 text-4xl">Moderation</h1>
          <form
            className="mt-8 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(() => {
                void (async () => {
                  const res = await loginAction("admin", password);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setAuthed(true);
                  router.refresh();
                })();
              });
            }}
          >
            <input
              type="password"
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="rounded-full bg-[#c4a574] px-5 py-3 text-[#1a140c]" disabled={pending}>
              Sign in
            </button>
            {error && <p className="text-sm text-[#d77a6d]">{error}</p>}
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#12141a] px-4 py-8 text-[#f2f0ea] sm:px-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/" className="text-sm uppercase tracking-[0.28em] text-[#c4a574]">
              LiveLens
            </Link>
            <h1 className="mt-1 text-3xl sm:text-4xl">Live control</h1>
          </div>
          <button
            className="rounded-full border border-white/20 px-4 py-2 text-sm"
            onClick={() =>
              start(() => {
                void (async () => {
                  await logoutAction();
                  setAuthed(false);
                  router.refresh();
                })();
              })
            }
          >
            Sign out
          </button>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl">Event branding</h2>
          <p className="mt-1 text-sm text-white/50">
            Shown on the home page and drives the celebration identity.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Couple names
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                value={localSettings.couple_names ?? ""}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, couple_names: e.target.value || null }))
                }
                placeholder="Alex & Jordan"
              />
            </label>
            <label className="text-sm">
              Event title
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                value={localSettings.event_title ?? ""}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, event_title: e.target.value || null }))
                }
                placeholder="Wedding celebration"
              />
            </label>
            <label className="text-sm">
              Date (display)
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                value={localSettings.event_date ?? ""}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, event_date: e.target.value || null }))
                }
                placeholder="Saturday, June 14"
              />
            </label>
            <label className="text-sm">
              Venue name
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                value={localSettings.venue_name ?? ""}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, venue_name: e.target.value || null }))
                }
              />
            </label>
            <label className="text-sm">
              Venue address
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                value={localSettings.venue_address ?? ""}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, venue_address: e.target.value || null }))
                }
              />
            </label>
            <div className="sm:col-span-2 space-y-3">
              <p className="text-sm">Hero image</p>
              {localSettings.hero_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={localSettings.hero_image_url}
                  alt=""
                  className="h-32 w-full max-w-md rounded-xl object-cover"
                />
              )}
              <label className="inline-flex cursor-pointer rounded-full border border-white/20 px-4 py-2 text-sm hover:border-white/40">
                {heroBusy ? "Uploading…" : "Upload photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={heroBusy}
                  onChange={(e) => {
                    void onHeroFile(e.target.files?.[0] || null);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="block text-sm">
                Or paste URL
                <input
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                  value={localSettings.hero_image_url ?? ""}
                  onChange={(e) =>
                    setLocalSettings((s) => ({ ...s, hero_image_url: e.target.value || null }))
                  }
                  placeholder="https://… (R2 public URL)"
                />
              </label>
              {heroMsg && (
                <p
                  className={`text-sm ${
                    heroMsg.toLowerCase().includes("fail") ? "text-[#d77a6d]" : "text-[#e8d5b5]"
                  }`}
                >
                  {heroMsg}
                </p>
              )}
            </div>
            <label className="text-sm sm:col-span-2">
              Welcome message
              <textarea
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                rows={3}
                value={localSettings.welcome_message ?? ""}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, welcome_message: e.target.value || null }))
                }
              />
            </label>
          </div>
          <button
            className="mt-4 rounded-full bg-[#c4a574] px-4 py-2 text-[#1a140c]"
            onClick={() =>
              start(() => {
                void (async () => {
                  await updateSettingsAction(localSettings);
                  router.refresh();
                })();
              })
            }
          >
            Save branding
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl">Guest upload</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={localSettings.guest_upload_enabled}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, guest_upload_enabled: e.target.checked }))
                }
              />
              Guest upload enabled
            </label>
            <label className="text-sm">
              Mode
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                value={localSettings.guest_upload_mode}
                onChange={(e) =>
                  setLocalSettings((s) => ({
                    ...s,
                    guest_upload_mode: e.target.value as GuestUploadMode,
                  }))
                }
              >
                <option value="open">Open (live immediately)</option>
                <option value="moderated">Moderated</option>
                <option value="invite_code">Invite code</option>
              </select>
            </label>
            <label className="text-sm">
              Max photo bytes
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                value={localSettings.max_photo_bytes}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, max_photo_bytes: Number(e.target.value) }))
                }
              />
            </label>
            <label className="text-sm">
              Max video bytes
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                value={localSettings.max_video_bytes}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, max_video_bytes: Number(e.target.value) }))
                }
              />
            </label>
            <label className="text-sm">
              Max guest / wish video (seconds)
              <input
                type="number"
                min={1}
                max={60}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                value={localSettings.max_video_seconds}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, max_video_seconds: Number(e.target.value) }))
                }
              />
            </label>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={localSettings.live_include_guest_video}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, live_include_guest_video: e.target.checked }))
                }
              />
              Mix guest videos into /live (wishes never appear on live)
            </label>
          </div>
          <button
            className="mt-4 rounded-full bg-[#c4a574] px-4 py-2 text-[#1a140c]"
            onClick={() =>
              start(() => {
                void (async () => {
                  await updateSettingsAction(localSettings);
                  router.refresh();
                })();
              })
            }
          >
            Save settings
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl">Invite codes</h2>
          <p className="mt-1 text-sm text-white/50">
            Optional prefix + required 4 digits. Example:{" "}
            <span className="font-mono text-white/80">{prefix || ""}1234</span>
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Prefix (optional)
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 uppercase"
                value={localSettings.invite_code_prefix ?? ""}
                onChange={(e) =>
                  setLocalSettings((s) => ({
                    ...s,
                    invite_code_prefix: e.target.value.replace(/[^a-zA-Z0-9]/g, "") || null,
                  }))
                }
                placeholder="STYNE"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="rounded-full border border-white/20 px-4 py-2 text-sm"
                onClick={() =>
                  start(() => {
                    void (async () => {
                      await updateSettingsAction({
                        invite_code_prefix: localSettings.invite_code_prefix,
                      });
                      router.refresh();
                    })();
                  })
                }
              >
                Save prefix
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              4 digits
              <input
                className="mt-1 w-28 rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono tracking-widest"
                inputMode="numeric"
                maxLength={4}
                value={codeDigits}
                onChange={(e) => setCodeDigits(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
              />
            </label>
            <button
              type="button"
              className="rounded-full border border-white/20 px-4 py-2 text-sm"
              onClick={randomDigits}
            >
              Generate
            </button>
            <input
              type="number"
              className="w-24 rounded-lg border border-white/15 bg-black/40 px-3 py-2"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              title="Hours"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
              />
              Auto-approve
            </label>
            <button
              className="rounded-full border border-white/20 px-4 py-2 text-sm"
              disabled={codeDigits.length !== 4}
              onClick={() =>
                start(() => {
                  void (async () => {
                    if (!/^\d{4}$/.test(codeDigits)) return;
                    await createUploadCodeAction({
                      code: previewCode,
                      hours,
                      maxUses: 100,
                      autoApprove,
                    });
                    setCodeDigits("");
                    router.refresh();
                  })();
                })
              }
            >
              Create {previewCode || "····"}
            </button>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            {codes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-white">{c.code}</span>
                <span>
                  · uses {c.uses}/{c.max_uses} · expires {new Date(c.expires_at).toLocaleString()}
                  {c.auto_approve ? " · auto" : " · moderated"}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-[#d77a6d]"
                  onClick={() => {
                    if (!confirm(`Delete code ${c.code}?`)) return;
                    start(() => {
                      void (async () => {
                        await deleteUploadCodeAction(c.id);
                        router.refresh();
                      })();
                    });
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl">Moderation queue ({pendingMedia.length})</h2>
          {pendingMedia.length === 0 ? (
            <p className="text-sm text-white/45">Nothing waiting for approval.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {pendingMedia.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  pending={pending}
                  start={start}
                  router={router}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xl">Photos ({approvedMedia.length} live)</h2>
          {approvedMedia.length === 0 ? (
            <p className="text-sm text-white/45">No approved media yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {approvedMedia.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  pending={pending}
                  start={start}
                  router={router}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
