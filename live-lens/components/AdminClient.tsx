"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adminLoginAction,
  createUploadCodeAction,
  deleteMediaAction,
  deleteMediaBulkAction,
  deleteUploadCodeAction,
  inviteAdminAction,
  listAdminMediaAction,
  listAdminsAction,
  logoutAction,
  setMediaApprovedAction,
  setMediaApprovedBulkAction,
  updateSettingsAction,
  type AdminAccount,
  type AdminMediaStatus,
  type AdminMediaTagFilter,
  type MediaCursor,
} from "@/app/actions";
import { SocialPlatformIcon } from "@/components/SocialIcons";
import {
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  canAddSocialLink,
  defaultSocialPlatform,
  isSocialPlatform,
} from "@/lib/social";
import { getSiteUrl } from "@/lib/site-url";
import { createBrowserAuthClient } from "@/lib/supabase/browser-auth";
import type {
  EventSettings,
  GuestUploadMode,
  LiveDisplayMode,
  MediaRow,
  MediaSource,
  MediaType,
  SocialLink,
  UploadCode,
} from "@/lib/types";

type Props = {
  initiallyAuthed: boolean;
  settings: EventSettings;
  initialMedia: MediaRow[];
  initialNextCursor: MediaCursor | null;
  initialPendingCount: number;
  initialStatus: AdminMediaStatus;
  codes: UploadCode[];
  initialAuthError?: string | null;
  /** Clear a leftover non-admin Auth session on the client (Server Components cannot set cookies). */
  rejectSession?: boolean;
};

type ChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
};

const PHOTO_MB_PRESETS = [2, 5, 10, 20] as const;
const VIDEO_MB_PRESETS = [10, 25, 50, 100] as const;
const VIDEO_SECONDS_PRESETS = [5, 10, 15, 30, 60] as const;
const CUSTOM = "__custom__";

function SocialLinksEditor({
  links,
  onChange,
}: {
  links: SocialLink[];
  onChange: (next: SocialLink[]) => void;
}) {
  function updateAt(index: number, patch: Partial<SocialLink>) {
    onChange(
      links.map((link, i) => {
        if (i !== index) return link;
        return { ...link, ...patch };
      }),
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {links.map((link, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
          <label className="w-full text-sm sm:w-44 sm:shrink-0">
            <span className="mb-1 flex items-center gap-2 text-white/70">
              <SocialPlatformIcon platform={link.platform} className="h-4 w-4" />
              Platform
            </span>
            <select
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
              value={link.platform}
              onChange={(e) => {
                const platform = e.target.value;
                if (!isSocialPlatform(platform)) return;
                updateAt(index, { platform });
              }}
            >
              {SOCIAL_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {SOCIAL_PLATFORM_LABELS[platform]}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 flex-1 text-sm">
            URL
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={link.url}
              onChange={(e) => updateAt(index, { url: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="rounded-full border border-white/20 px-3 py-2 text-sm text-white/70 hover:border-white/40 hover:text-white"
            onClick={() => onChange(links.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      {canAddSocialLink(links) && (
        <button
          type="button"
          className="rounded-full border border-dashed border-white/25 px-4 py-2 text-sm text-white/70 hover:border-white/45 hover:text-white"
          onClick={() =>
            onChange([...links, { platform: defaultSocialPlatform(links), url: "" }])
          }
        >
          Add link
        </button>
      )}
    </div>
  );
}

function bytesToMb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function mbToBytes(mb: number) {
  return Math.round(mb * 1024 * 1024);
}

function SizeSelect({
  label,
  value,
  presets,
  unit,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  presets: readonly number[];
  unit: string;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}) {
  const isPreset = presets.some((p) => p === value);
  const [customMode, setCustomMode] = useState(!isPreset);
  const showCustom = customMode || !isPreset;
  const selectValue = showCustom ? CUSTOM : String(value);

  return (
    <label className="text-sm">
      {label}
      <select
        className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustomMode(true);
            return;
          }
          setCustomMode(false);
          onChange(Number(e.target.value));
        }}
      >
        {presets.map((p) => (
          <option key={p} value={p}>
            {p} {unit}
          </option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {showCustom ? (
        <input
          type="number"
          min={min}
          max={max}
          step={unit === "MB" ? 0.1 : 1}
          className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            let next = n;
            if (min != null) next = Math.max(min, next);
            if (max != null) next = Math.min(max, next);
            onChange(next);
          }}
        />
      ) : null}
    </label>
  );
}

function Chip({ label, active, onClick, count }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition ${
        active
          ? "bg-[#c4a574] text-[#1a140c]"
          : "border border-white/15 bg-white/5 text-white/75 hover:border-white/35"
      }`}
    >
      {label}
      {count != null && <span className="ml-1.5 opacity-70">{count}</span>}
    </button>
  );
}

function MediaCard({
  item,
  selected,
  busy,
  onToggleSelect,
  onApproveToggle,
  onDelete,
}: {
  item: MediaRow;
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onApproveToggle: () => void;
  onDelete: () => void;
}) {
  const isWish = item.tag?.toLowerCase() === "wish";
  return (
    <article
      className={`overflow-hidden rounded-xl border bg-black/30 transition ${
        selected ? "border-[#c4a574] ring-2 ring-[#c4a574]/40" : "border-white/10"
      }`}
    >
      <div className="relative">
        <button
          type="button"
          aria-label={selected ? "Deselect" : "Select"}
          className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border text-xs ${
            selected
              ? "border-[#c4a574] bg-[#c4a574] text-[#1a140c]"
              : "border-white/40 bg-black/50 text-white"
          }`}
          onClick={onToggleSelect}
        >
          {selected ? "✓" : ""}
        </button>
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
      </div>
      <div className="space-y-2 p-2 text-xs">
        <div className="flex flex-wrap gap-1">
          <span
            className={`rounded-full px-1.5 py-0.5 ${
              item.approved ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-100"
            }`}
          >
            {item.approved ? "live" : "pending"}
          </span>
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-white/70">
            {item.media_type}
          </span>
          {isWish && (
            <span className="rounded-full bg-[#c4a574]/25 px-1.5 py-0.5 text-[#e8d5b5]">wish</span>
          )}
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-white/50">{item.source}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            className="rounded-full bg-[#c4a574] px-2 py-1 text-[#1a140c] disabled:opacity-50"
            disabled={busy}
            onClick={onApproveToggle}
          >
            {item.approved ? "Hide" : "Approve"}
          </button>
          <button
            className="rounded-full border border-white/20 px-2 py-1 disabled:opacity-50"
            disabled={busy}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export function AdminClient({
  initiallyAuthed,
  settings,
  initialMedia,
  initialNextCursor,
  initialPendingCount,
  initialStatus,
  codes,
  initialAuthError = null,
  rejectSession = false,
}: Props) {
  const router = useRouter();
  const [authed, setAuthed] = useState(initiallyAuthed);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialAuthError);
  const [loginBusy, setLoginBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);
  const [codeDigits, setCodeDigits] = useState("");
  const [hours, setHours] = useState(6);
  const [autoApprove, setAutoApprove] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [promoLogoBusy, setPromoLogoBusy] = useState(false);
  const [liveSettingsError, setLiveSettingsError] = useState<string | null>(null);

  const [savingBranding, setSavingBranding] = useState(false);
  const [savingWishPrompt, setSavingWishPrompt] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);

  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  const [adminTab, setAdminTab] = useState<"gallery" | "settings">("gallery");
  const [status, setStatus] = useState<AdminMediaStatus>(initialStatus);
  const [mediaType, setMediaType] = useState<MediaType | "all">("all");
  const [tag, setTag] = useState<AdminMediaTagFilter>("all");
  const [source, setSource] = useState<MediaSource | "all">("all");
  const [media, setMedia] = useState(initialMedia);
  const [nextCursor, setNextCursor] = useState<MediaCursor | null>(initialNextCursor);
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [itemBusyId, setItemBusyId] = useState<string | null>(null);

  // Counts for live-mode empty warnings (from loaded + known pending)
  const approvedVideoCount = useMemo(
    () => media.filter((m) => m.approved && m.media_type === "video").length,
    [media],
  );
  const approvedWishCount = useMemo(
    () => media.filter((m) => m.approved && m.tag?.toLowerCase() === "wish").length,
    [media],
  );

  const prefix = (localSettings.invite_code_prefix ?? "").trim();
  const previewCode = `${prefix}${codeDigits}`.toUpperCase();

  function liveModeEmptyMessage(mode: LiveDisplayMode): string | null {
    if (mode === "video" && approvedVideoCount === 0) {
      return "No videos in the loaded list yet — live wall may be empty in Video mode.";
    }
    if (mode === "wish" && approvedWishCount === 0) {
      return "No wishes in the loaded list yet — live wall may be empty in Wish mode.";
    }
    return null;
  }

  const fetchPage = useCallback(
    async (opts: { append: boolean; cursor?: MediaCursor | null; preserveSelection?: boolean }) => {
      if (opts.append) setLoadingMore(true);
      else if (!opts.preserveSelection) setGalleryLoading(true);
      try {
        const page = await listAdminMediaAction({
          status,
          mediaType,
          tag,
          source,
          cursor: opts.cursor ?? null,
          limit: 24,
        });
        setPendingCount(page.pendingCount);
        setNextCursor(page.nextCursor);
        setMedia((prev) => (opts.append ? [...prev, ...page.items] : page.items));
        if (!opts.append && !opts.preserveSelection) setSelected(new Set());
        else if (!opts.append && opts.preserveSelection) {
          setSelected((prev) => {
            const ids = new Set(page.items.map((m) => m.id));
            const next = new Set<string>();
            for (const id of prev) if (ids.has(id)) next.add(id);
            return next;
          });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load media");
      } finally {
        setGalleryLoading(false);
        setLoadingMore(false);
      }
    },
    [status, mediaType, tag, source],
  );

  const filtersReady = useRef(false);
  useEffect(() => {
    if (!filtersReady.current) {
      filtersReady.current = true;
      return;
    }
    void fetchPage({ append: false });
  }, [status, mediaType, tag, source, fetchPage]);

  useEffect(() => {
    if (!rejectSession) return;
    void (async () => {
      try {
        await logoutAction();
      } catch {
        const supabase = createBrowserAuthClient();
        await supabase.auth.signOut();
      }
    })();
  }, [rejectSession]);

  // Authenticated Realtime: Admin JWT + media_select_admin RLS includes pending rows.
  useEffect(() => {
    if (!authed) return;

    const supabase = createBrowserAuthClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void fetchPage({ append: false, preserveSelection: true });
      }, 350);
    };

    const channel = supabase
      .channel("admin-media")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "media" },
        () => {
          scheduleRefetch();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_settings" },
        (payload) => {
          setLocalSettings(payload.new as EventSettings);
        },
      )
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [authed, fetchPage]);

  useEffect(() => {
    if (!authed || adminTab !== "settings") return;
    let cancelled = false;
    setAdminsLoading(true);
    void (async () => {
      try {
        const list = await listAdminsAction();
        if (!cancelled) setAdmins(list);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load admins");
        }
      } finally {
        if (!cancelled) setAdminsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, adminTab]);

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
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/hero", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.url) {
        setLocalSettings((s) => ({ ...s, hero_image_url: data.url! }));
        toast.success("Hero image uploaded");
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setHeroBusy(false);
    }
  }

  async function onPromoLogoFile(file: File | null) {
    if (!file) return;
    setPromoLogoBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/promo-logo", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.url) {
        setLocalSettings((s) => ({ ...s, promo_logo_url: data.url! }));
        toast.success("Promo logo uploaded");
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPromoLogoBusy(false);
    }
  }

  async function saveBranding() {
    setSavingBranding(true);
    try {
      await updateSettingsAction(localSettings);
      toast.success("Branding saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setSavingBranding(false);
    }
  }

  async function saveWishPrompt() {
    setSavingWishPrompt(true);
    try {
      await updateSettingsAction({
        wish_prompt: localSettings.wish_prompt,
      });
      toast.success("Wish prompt saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save wish prompt");
    } finally {
      setSavingWishPrompt(false);
    }
  }

  async function saveSettings() {
    const emptyMsg = liveModeEmptyMessage(localSettings.live_display_mode ?? "normal");
    if (emptyMsg) {
      setLiveSettingsError(emptyMsg);
      toast.message(emptyMsg);
    } else {
      setLiveSettingsError(null);
    }
    setSavingSettings(true);
    try {
      await updateSettingsAction(localSettings);
      toast.success("Settings saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function savePrefix() {
    setSavingPrefix(true);
    try {
      await updateSettingsAction({
        invite_code_prefix: localSettings.invite_code_prefix,
      });
      toast.success("Prefix saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save prefix");
    } finally {
      setSavingPrefix(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(media.map((m) => m.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function onApproveToggle(item: MediaRow) {
    setItemBusyId(item.id);
    try {
      await setMediaApprovedAction(item.id, !item.approved);
      setMedia((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, approved: !item.approved } : m)),
      );
      setPendingCount((c) => (item.approved ? c + 1 : Math.max(0, c - 1)));
      toast.success(item.approved ? "Hidden from live" : "Approved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setItemBusyId(null);
    }
  }

  async function onDeleteOne(item: MediaRow) {
    if (!confirm("Delete this item?")) return;
    setItemBusyId(item.id);
    try {
      await deleteMediaAction(item.id);
      setMedia((prev) => prev.filter((m) => m.id !== item.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      if (!item.approved) setPendingCount((c) => Math.max(0, c - 1));
      toast.success("Deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setItemBusyId(null);
    }
  }

  async function bulkApprove(approved: boolean) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await setMediaApprovedBulkAction(ids, approved);
      setMedia((prev) => prev.map((m) => (selected.has(m.id) ? { ...m, approved } : m)));
      await fetchPage({ append: false });
      clearSelection();
      toast.success(approved ? `Approved ${ids.length}` : `Hid ${ids.length}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} items?`)) return;
    setBulkBusy(true);
    try {
      await deleteMediaBulkAction(ids);
      setMedia((prev) => prev.filter((m) => !selected.has(m.id)));
      clearSelection();
      await fetchPage({ append: false });
      toast.success(`Deleted ${ids.length}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkBusy(false);
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
              void (async () => {
                setLoginBusy(true);
                setError(null);
                try {
                  const res = await adminLoginAction(email, password);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setAuthed(true);
                  router.refresh();
                } finally {
                  setLoginBusy(false);
                }
              })();
            }}
          >
            <input
              type="email"
              autoComplete="username"
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              className="w-full rounded-full bg-[#c4a574] px-5 py-3 text-[#1a140c] disabled:opacity-50"
              disabled={loginBusy || googleBusy}
            >
              {loginBusy ? "Signing in…" : "Sign in"}
            </button>
            {error && <p className="text-sm text-[#d77a6d]">{error}</p>}
          </form>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/35">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <button
            type="button"
            className="w-full rounded-full border border-white/20 px-5 py-3 text-sm disabled:opacity-50"
            disabled={loginBusy || googleBusy}
            onClick={() => {
              void (async () => {
                setGoogleBusy(true);
                setError(null);
                try {
                  const site = getSiteUrl() || window.location.origin;
                  const supabase = createBrowserAuthClient();
                  const { error: oauthError } = await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: `${site}/auth/callback` },
                  });
                  if (oauthError) setError(oauthError.message);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Google sign-in failed");
                  setGoogleBusy(false);
                }
              })();
            }}
          >
            {googleBusy ? "Redirecting…" : "Continue with Google"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#12141a] px-4 py-8 text-[#f2f0ea] sm:px-6">
      <div className="mx-auto max-w-6xl space-y-8 pb-24">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/" className="text-sm uppercase tracking-[0.28em] text-[#c4a574]">
              LiveLens
            </Link>
            <h1 className="mt-1 text-3xl sm:text-4xl">Live control</h1>
          </div>
          <button
            className="rounded-full border border-white/20 px-4 py-2 text-sm"
            onClick={() => {
              void (async () => {
                await logoutAction();
                setAuthed(false);
                router.refresh();
              })();
            }}
          >
            Sign out
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-1">
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm transition ${
              adminTab === "gallery"
                ? "bg-[#c4a574] text-[#1a140c]"
                : "border border-white/20 text-white/70 hover:border-white/40 hover:text-white"
            }`}
            onClick={() => setAdminTab("gallery")}
          >
            Gallery
            {pendingCount > 0 && (
              <span
                className={`ml-2 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-xs ${
                  adminTab === "gallery"
                    ? "bg-[#1a140c]/20 text-[#1a140c]"
                    : "bg-amber-500/25 text-amber-100"
                }`}
              >
                {pendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm transition ${
              adminTab === "settings"
                ? "bg-[#c4a574] text-[#1a140c]"
                : "border border-white/20 text-white/70 hover:border-white/40 hover:text-white"
            }`}
            onClick={() => setAdminTab("settings")}
          >
            Settings
          </button>
        </nav>

        {adminTab === "settings" && (
          <>
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
            <div className="space-y-3 sm:col-span-2">
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
            <div className="sm:col-span-2">
              <h3 className="text-base text-white/90">Event social</h3>
              <p className="mt-1 text-sm text-white/50">
                Optional links for the couple or event. Shown on the home page and upload when set.
              </p>
              <SocialLinksEditor
                links={localSettings.event_social_links ?? []}
                onChange={(event_social_links) =>
                  setLocalSettings((s) => ({ ...s, event_social_links }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <h3 className="text-base text-white/90">Promo / studio</h3>
              <p className="mt-1 text-sm text-white/50">
                Promotion links and logo (e.g. photographer). Logo appears bottom-left on home and
                upload when set.
              </p>
              <div className="mt-3 space-y-3">
                <p className="text-sm text-white/80">Logo</p>
                {localSettings.promo_logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={localSettings.promo_logo_url}
                    alt=""
                    className="h-16 max-w-[200px] rounded-lg bg-black/40 object-contain p-2"
                  />
                )}
                <label className="inline-flex cursor-pointer rounded-full border border-white/20 px-4 py-2 text-sm hover:border-white/40">
                  {promoLogoBusy ? "Uploading…" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={promoLogoBusy}
                    onChange={(e) => {
                      void onPromoLogoFile(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Or paste logo URL
                  <input
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                    value={localSettings.promo_logo_url ?? ""}
                    onChange={(e) =>
                      setLocalSettings((s) => ({
                        ...s,
                        promo_logo_url: e.target.value || null,
                      }))
                    }
                    placeholder="https://… (R2 public URL)"
                  />
                </label>
                {localSettings.promo_logo_url && (
                  <button
                    type="button"
                    className="text-sm text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
                    onClick={() =>
                      setLocalSettings((s) => ({ ...s, promo_logo_url: null }))
                    }
                  >
                    Clear logo
                  </button>
                )}
              </div>
              <SocialLinksEditor
                links={localSettings.promo_social_links ?? []}
                onChange={(promo_social_links) =>
                  setLocalSettings((s) => ({ ...s, promo_social_links }))
                }
              />
            </div>
          </div>
          <button
            className="mt-4 rounded-full bg-[#c4a574] px-4 py-2 text-[#1a140c] disabled:opacity-50"
            disabled={savingBranding}
            onClick={() => void saveBranding()}
          >
            {savingBranding ? "Saving…" : "Save branding"}
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl">Wish prompt</h2>
          <p className="mt-1 text-sm text-white/50">
            Shown on the wish camera when set. Also used as the message on the live share CTA.
            Leave blank to hide on wish and use the default CTA line on live.
          </p>
          <label className="mt-4 block text-sm">
            Prompt
            <textarea
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
              rows={3}
              maxLength={200}
              value={localSettings.wish_prompt ?? ""}
              onChange={(e) =>
                setLocalSettings((s) => ({
                  ...s,
                  wish_prompt: e.target.value.slice(0, 200) || null,
                }))
              }
              placeholder="Even from afar, your love belongs here — leave a short wish for the couple."
            />
            <span className="mt-1 block text-xs text-white/40">
              {(localSettings.wish_prompt ?? "").length}/200
            </span>
          </label>
          <button
            className="mt-4 rounded-full bg-[#c4a574] px-4 py-2 text-[#1a140c] disabled:opacity-50"
            disabled={savingWishPrompt}
            onClick={() => void saveWishPrompt()}
          >
            {savingWishPrompt ? "Saving…" : "Save wish prompt"}
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
            <SizeSelect
              label="Max photo size"
              value={bytesToMb(localSettings.max_photo_bytes)}
              presets={PHOTO_MB_PRESETS}
              unit="MB"
              min={0.1}
              onChange={(mb) =>
                setLocalSettings((s) => ({ ...s, max_photo_bytes: mbToBytes(mb) }))
              }
            />
            <SizeSelect
              label="Max video size"
              value={bytesToMb(localSettings.max_video_bytes)}
              presets={VIDEO_MB_PRESETS}
              unit="MB"
              min={0.1}
              onChange={(mb) =>
                setLocalSettings((s) => ({ ...s, max_video_bytes: mbToBytes(mb) }))
              }
            />
            <SizeSelect
              label="Max video length"
              value={localSettings.max_video_seconds}
              presets={VIDEO_SECONDS_PRESETS}
              unit="seconds"
              min={1}
              max={60}
              onChange={(seconds) =>
                setLocalSettings((s) => ({ ...s, max_video_seconds: Math.round(seconds) }))
              }
            />
            <label className="text-sm sm:col-span-2">
              Live mode
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                value={localSettings.live_display_mode ?? "normal"}
                onChange={(e) => {
                  const mode = e.target.value as LiveDisplayMode;
                  setLiveSettingsError(liveModeEmptyMessage(mode));
                  setLocalSettings((s) => ({ ...s, live_display_mode: mode }));
                }}
              >
                <option value="normal">Normal — all media</option>
                <option value="video">Video — videos only (sound on)</option>
                <option value="wish">Wish — wishes only</option>
              </select>
            </label>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={localSettings.live_sync_enabled ?? true}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, live_sync_enabled: e.target.checked }))
                }
              />
              Sync /live screens (same slide on every device)
            </label>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={localSettings.live_include_guest_video}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, live_include_guest_video: e.target.checked }))
                }
              />
              Mix guest videos into /live (Normal mode only)
            </label>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={localSettings.live_cta_enabled ?? true}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, live_cta_enabled: e.target.checked }))
                }
              />
              Show share CTA on live
            </label>
            {(localSettings.live_cta_enabled ?? true) && (
              <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:col-span-2 sm:grid-cols-2">
                <label className="flex items-center gap-3 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={localSettings.live_cta_on_empty ?? true}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, live_cta_on_empty: e.target.checked }))
                    }
                  />
                  When queue is empty
                </label>
                <label className="flex items-center gap-3 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={localSettings.live_cta_on_loop ?? true}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, live_cta_on_loop: e.target.checked }))
                    }
                  />
                  Once per playlist loop
                </label>
                <label className="text-sm">
                  Every N slides (0 = off)
                  <input
                    type="number"
                    min={0}
                    max={60}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                    value={localSettings.live_cta_every_n ?? 0}
                    onChange={(e) =>
                      setLocalSettings((s) => ({
                        ...s,
                        live_cta_every_n: Math.max(0, Math.min(60, Number(e.target.value) || 0)),
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Interval seconds (0 = off, min 30)
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    step={30}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                    value={localSettings.live_cta_interval_sec ?? 0}
                    onChange={(e) =>
                      setLocalSettings((s) => ({
                        ...s,
                        live_cta_interval_sec: Math.max(
                          0,
                          Math.min(3600, Number(e.target.value) || 0),
                        ),
                      }))
                    }
                  />
                </label>
              </div>
            )}
            {liveSettingsError && (
              <p className="text-sm text-[#d77a6d] sm:col-span-2">{liveSettingsError}</p>
            )}
          </div>
          <button
            className="mt-4 rounded-full bg-[#c4a574] px-4 py-2 text-[#1a140c] disabled:opacity-50"
            disabled={savingSettings}
            onClick={() => void saveSettings()}
          >
            {savingSettings ? "Saving…" : "Save settings"}
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
                className="rounded-full border border-white/20 px-4 py-2 text-sm disabled:opacity-50"
                disabled={savingPrefix}
                onClick={() => void savePrefix()}
              >
                {savingPrefix ? "Saving…" : "Save prefix"}
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
              className="rounded-full border border-white/20 px-4 py-2 text-sm disabled:opacity-50"
              disabled={codeDigits.length !== 4 || codeBusy}
              onClick={() => {
                void (async () => {
                  if (!/^\d{4}$/.test(codeDigits)) return;
                  setCodeBusy(true);
                  try {
                    await createUploadCodeAction({
                      code: previewCode,
                      hours,
                      maxUses: 100,
                      autoApprove,
                    });
                    setCodeDigits("");
                    toast.success(`Created ${previewCode}`);
                    router.refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to create code");
                  } finally {
                    setCodeBusy(false);
                  }
                })();
              }}
            >
              {codeBusy ? "Creating…" : `Create ${previewCode || "····"}`}
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
                    void (async () => {
                      try {
                        await deleteUploadCodeAction(c.id);
                        toast.success(`Deleted ${c.code}`);
                        router.refresh();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to delete code");
                      }
                    })();
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl">Admins</h2>
          <p className="mt-1 text-sm text-white/50">
            Invite by email. Invitees set a password via the link, or sign in with Google using the
            same email after the invite.
          </p>
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                setInviteBusy(true);
                try {
                  await inviteAdminAction(inviteEmail);
                  setInviteEmail("");
                  toast.success("Invite sent");
                  const list = await listAdminsAction();
                  setAdmins(list);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Invite failed");
                } finally {
                  setInviteBusy(false);
                }
              })();
            }}
          >
            <label className="min-w-[14rem] flex-1 text-sm">
              Email
              <input
                type="email"
                required
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
                placeholder="admin@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="rounded-full border border-white/20 px-4 py-2 text-sm disabled:opacity-50"
              disabled={inviteBusy || !inviteEmail.trim()}
            >
              {inviteBusy ? "Sending…" : "Send invite"}
            </button>
          </form>
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            {adminsLoading && <li className="text-white/45">Loading…</li>}
            {!adminsLoading && admins.length === 0 && (
              <li className="text-white/45">No admins listed yet.</li>
            )}
            {admins.map((a) => (
              <li key={a.id} className="font-mono text-white">
                {a.email}
              </li>
            ))}
          </ul>
        </section>
          </>
        )}

        {adminTab === "gallery" && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl">Gallery</h2>
              <p className="mt-1 text-sm text-white/50">
                Showing {media.length}
                {nextCursor ? "+" : ""} · filter on server · load more as needed
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full border border-white/20 px-3 py-1.5 text-sm"
                onClick={selectAllVisible}
                disabled={media.length === 0}
              >
                Select all
              </button>
              <button
                type="button"
                className="rounded-full border border-white/20 px-3 py-1.5 text-sm"
                onClick={clearSelection}
                disabled={selected.size === 0}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Chip
              label="Pending"
              active={status === "pending"}
              count={pendingCount}
              onClick={() => setStatus("pending")}
            />
            <Chip label="Live" active={status === "live"} onClick={() => setStatus("live")} />
            <Chip label="All" active={status === "all"} onClick={() => setStatus("all")} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Chip label="All types" active={mediaType === "all"} onClick={() => setMediaType("all")} />
            <Chip
              label="Photo"
              active={mediaType === "photo"}
              onClick={() => setMediaType("photo")}
            />
            <Chip
              label="Video"
              active={mediaType === "video"}
              onClick={() => setMediaType("video")}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Chip label="All tags" active={tag === "all"} onClick={() => setTag("all")} />
            <Chip label="Wish" active={tag === "wish"} onClick={() => setTag("wish")} />
            <Chip label="Other" active={tag === "other"} onClick={() => setTag("other")} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Chip label="All sources" active={source === "all"} onClick={() => setSource("all")} />
            <Chip
              label="Guest"
              active={source === "guest"}
              onClick={() => setSource("guest")}
            />
            <Chip
              label="Staff"
              active={source === "staff"}
              onClick={() => setSource("staff")}
            />
            <Chip
              label="Pro"
              active={source === "pro_camera"}
              onClick={() => setSource("pro_camera")}
            />
          </div>

          {galleryLoading ? (
            <p className="mt-6 text-sm text-white/45">Loading…</p>
          ) : media.length === 0 ? (
            <p className="mt-6 text-sm text-white/45">No media match these filters.</p>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {media.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  busy={bulkBusy || itemBusyId === item.id}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onApproveToggle={() => void onApproveToggle(item)}
                  onDelete={() => void onDeleteOne(item)}
                />
              ))}
            </div>
          )}

          {nextCursor && !galleryLoading && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                className="rounded-full border border-white/20 px-5 py-2 text-sm disabled:opacity-50"
                disabled={loadingMore}
                onClick={() => void fetchPage({ append: true, cursor: nextCursor })}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </section>
        )}
      </div>

      {adminTab === "gallery" && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#12141a]/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white/70">{selected.size} selected</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-[#c4a574] px-4 py-2 text-sm text-[#1a140c] disabled:opacity-50"
                disabled={bulkBusy}
                onClick={() => void bulkApprove(true)}
              >
                Approve
              </button>
              <button
                type="button"
                className="rounded-full border border-white/20 px-4 py-2 text-sm disabled:opacity-50"
                disabled={bulkBusy}
                onClick={() => void bulkApprove(false)}
              >
                Hide
              </button>
              <button
                type="button"
                className="rounded-full border border-[#d77a6d]/50 px-4 py-2 text-sm text-[#d77a6d] disabled:opacity-50"
                disabled={bulkBusy}
                onClick={() => void bulkDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
