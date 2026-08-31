"use server";

import { createPresignedUpload } from "@/lib/r2";
import { createServiceSupabase } from "@/lib/supabase/server";
import { checkPassword, isAdmin, isStaff, setRoleCookie, clearRoleCookies } from "@/lib/auth";
import type {
  EventSettings,
  GuestUploadMode,
  LiveDisplayMode,
  MediaRow,
  MediaSource,
  MediaType,
} from "@/lib/types";

const LIVE_DISPLAY_MODES: LiveDisplayMode[] = ["normal", "video", "wish"];
const DEFAULT_PAGE_SIZE = 24;

export type MediaCursor = { created_at: string; id: string };

export type AdminMediaStatus = "pending" | "live" | "all";
export type AdminMediaTagFilter = "wish" | "other" | "all";

export type ListAdminMediaInput = {
  status?: AdminMediaStatus;
  mediaType?: MediaType | "all";
  tag?: AdminMediaTagFilter;
  source?: MediaSource | "all";
  cursor?: MediaCursor | null;
  limit?: number;
};

export type ListMediaPage = {
  items: MediaRow[];
  nextCursor: MediaCursor | null;
};

function applyMediaCursor<T extends { or: (filter: string) => T }>(
  query: T,
  cursor: MediaCursor | null | undefined,
): T {
  if (!cursor) return query;
  const ts = cursor.created_at.replace(/"/g, "");
  const id = cursor.id.replace(/"/g, "");
  return query.or(
    `created_at.lt."${ts}",and(created_at.eq."${ts}",id.lt."${id}")`,
  );
}

function pageFromRows(rows: MediaRow[], limit: number): ListMediaPage {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null,
  };
}

async function bumpLiveRotationEpoch(
  supabase: ReturnType<typeof createServiceSupabase>,
) {
  const now = new Date().toISOString();
  await supabase
    .from("event_settings")
    .update({ live_rotation_epoch: now, updated_at: now })
    .eq("id", "default");
}

function normalizeSettings(data: EventSettings): EventSettings {
  const mode = data.live_display_mode;
  return {
    ...data,
    invite_code_prefix: data.invite_code_prefix ?? null,
    max_video_seconds: data.max_video_seconds ?? 10,
    live_display_mode: LIVE_DISPLAY_MODES.includes(mode) ? mode : "normal",
    live_sync_enabled: data.live_sync_enabled ?? true,
    live_rotation_epoch: data.live_rotation_epoch ?? new Date().toISOString(),
  };
}

export async function loginAction(role: "admin" | "staff", password: string) {
  if (!checkPassword(role, password)) {
    return { ok: false as const, error: "Invalid password" };
  }
  await setRoleCookie(role);
  return { ok: true as const };
}

export async function logoutAction() {
  await clearRoleCookies();
  return { ok: true as const };
}

export async function getSettingsAction(): Promise<EventSettings | null> {
  const supabase = createServiceSupabase();
  const { data } = await supabase.from("event_settings").select("*").eq("id", "default").maybeSingle();
  if (!data) return null;
  return normalizeSettings(data as EventSettings);
}

/** Fixed-size fetch for live wall (no cursor). */
export async function getApprovedMediaAction(limit = 40): Promise<MediaRow[]> {
  const page = await listApprovedMediaAction({ limit, cursor: null });
  return page.items;
}

export async function listApprovedMediaAction(opts?: {
  cursor?: MediaCursor | null;
  limit?: number;
}): Promise<ListMediaPage> {
  const limit = opts?.limit ?? DEFAULT_PAGE_SIZE;
  const supabase = createServiceSupabase();
  let query = supabase
    .from("media")
    .select("*")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  query = applyMediaCursor(query, opts?.cursor);
  const { data, error } = await query;
  if (error) throw error;
  return pageFromRows((data || []) as MediaRow[], limit);
}

export async function listAdminMediaAction(
  input: ListAdminMediaInput = {},
): Promise<ListMediaPage & { pendingCount: number }> {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const limit = input.limit ?? DEFAULT_PAGE_SIZE;
  const status = input.status ?? "all";
  const mediaType = input.mediaType ?? "all";
  const tag = input.tag ?? "all";
  const source = input.source ?? "all";

  const { count: pendingCount } = await supabase
    .from("media")
    .select("*", { count: "exact", head: true })
    .eq("approved", false);

  let query = supabase
    .from("media")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (status === "pending") query = query.eq("approved", false);
  else if (status === "live") query = query.eq("approved", true);

  if (mediaType === "photo" || mediaType === "video") {
    query = query.eq("media_type", mediaType);
  }

  if (source !== "all") {
    query = query.eq("source", source);
  }

  if (tag === "wish") {
    query = query.ilike("tag", "wish");
  } else if (tag === "other") {
    query = query.or("tag.is.null,tag.not.ilike.wish");
  }

  query = applyMediaCursor(query, input.cursor);
  const { data, error } = await query;
  if (error) throw error;

  const page = pageFromRows((data || []) as MediaRow[], limit);
  return { ...page, pendingCount: pendingCount ?? 0 };
}

export async function setMediaApprovedAction(id: string, approved: boolean) {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("media").update({ approved }).eq("id", id);
  if (error) throw error;
  if (approved) await bumpLiveRotationEpoch(supabase);
  return { ok: true };
}

export async function setMediaApprovedBulkAction(ids: string[], approved: boolean) {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  if (ids.length === 0) return { ok: true as const };
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("media").update({ approved }).in("id", ids);
  if (error) throw error;
  if (approved) await bumpLiveRotationEpoch(supabase);
  return { ok: true as const };
}

export async function deleteMediaAction(id: string) {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("media").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

export async function deleteMediaBulkAction(ids: string[]) {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  if (ids.length === 0) return { ok: true as const };
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("media").delete().in("id", ids);
  if (error) throw error;
  return { ok: true as const };
}

export async function updateSettingsAction(patch: Partial<EventSettings>) {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const current = await getSettingsAction();

  const allowed: (keyof EventSettings)[] = [
    "guest_upload_enabled",
    "guest_upload_mode",
    "max_photo_bytes",
    "max_video_bytes",
    "max_video_seconds",
    "live_include_guest_video",
    "live_video_sound",
    "live_display_mode",
    "live_sync_enabled",
    "couple_names",
    "event_title",
    "event_date",
    "venue_name",
    "venue_address",
    "hero_image_url",
    "welcome_message",
    "invite_code_prefix",
  ];
  const safe: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in patch) safe[key] = patch[key];
  }

  if (
    typeof safe.live_display_mode === "string" &&
    !LIVE_DISPLAY_MODES.includes(safe.live_display_mode as LiveDisplayMode)
  ) {
    throw new Error("Invalid live display mode");
  }

  const modeChanging =
    safe.live_display_mode != null &&
    safe.live_display_mode !== current?.live_display_mode;
  const syncTurningOn =
    safe.live_sync_enabled === true && current?.live_sync_enabled === false;

  const now = new Date().toISOString();
  if (modeChanging || syncTurningOn) {
    safe.live_rotation_epoch = now;
  }

  const { error } = await supabase
    .from("event_settings")
    .update({ ...safe, updated_at: now })
    .eq("id", "default");
  if (error) throw error;
  return { ok: true };
}

export async function createUploadCodeAction(opts: {
  code: string;
  hours: number;
  maxUses: number;
  autoApprove: boolean;
}) {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const expires = new Date(Date.now() + opts.hours * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("upload_codes")
    .insert({
      code: opts.code.trim().toUpperCase(),
      expires_at: expires,
      max_uses: opts.maxUses,
      auto_approve: opts.autoApprove,
      active: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteUploadCodeAction(id: string) {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("upload_codes").delete().eq("id", id);
  if (error) throw error;
  return { ok: true as const };
}

export async function listUploadCodesAction() {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const { data } = await supabase.from("upload_codes").select("*").order("created_at", { ascending: false }).limit(50);
  return data || [];
}

export async function validateInviteCodeAction(code: string) {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("upload_codes")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data || data.uses >= data.max_uses) return { ok: false as const };
  return { ok: true as const, autoApprove: data.auto_approve as boolean, id: data.id as string };
}

export async function createUploadUrlAction(input: {
  role: "guest" | "staff";
  contentType: string;
  extension: string;
  inviteCode?: string;
}) {
  const settings = await getSettingsAction();
  if (!settings) throw new Error("Settings missing");

  if (input.role === "guest") {
    if (!settings.guest_upload_enabled) throw new Error("Guest upload is disabled");
    if (settings.guest_upload_mode === "invite_code") {
      if (!input.inviteCode) throw new Error("Invite code required");
      const check = await validateInviteCodeAction(input.inviteCode);
      if (!check.ok) throw new Error("Invalid or expired invite code");
    }
  } else {
    if (!(await isStaff())) throw new Error("Unauthorized");
  }

  const isVideo = input.contentType.startsWith("video/");
  return createPresignedUpload({
    folder: input.role,
    contentType: input.contentType,
    extension: input.extension || (isVideo ? "mp4" : "jpg"),
  });
}

export async function finalizeUploadAction(input: {
  role: "guest" | "staff";
  publicUrl: string;
  mediaType: "photo" | "video";
  uploaderName?: string;
  durationMs?: number;
  inviteCode?: string;
  focalX?: number | null;
  focalY?: number | null;
}) {
  const settings = await getSettingsAction();
  if (!settings) throw new Error("Settings missing");
  const supabase = createServiceSupabase();

  let approved = false;
  if (input.role === "staff") {
    if (!(await isStaff())) throw new Error("Unauthorized");
    approved = true;
  } else {
    if (!settings.guest_upload_enabled) throw new Error("Guest upload is disabled");
    const mode = settings.guest_upload_mode as GuestUploadMode;
    if (mode === "open") approved = true;
    else if (mode === "moderated") approved = false;
    else {
      const check = await validateInviteCodeAction(input.inviteCode || "");
      if (!check.ok) throw new Error("Invalid invite code");
      approved = check.autoApprove;
      const { data: codeRow } = await supabase
        .from("upload_codes")
        .select("uses")
        .eq("id", check.id)
        .single();
      await supabase
        .from("upload_codes")
        .update({ uses: (codeRow?.uses ?? 0) + 1 })
        .eq("id", check.id);
    }
  }

  const { data, error } = await supabase
    .from("media")
    .insert({
      url: input.publicUrl,
      media_type: input.mediaType,
      source: input.role === "staff" ? "staff" : "guest",
      uploader_name: input.uploaderName || (input.role === "staff" ? "Staff" : "Guest"),
      duration_ms: input.durationMs ?? null,
      approved,
      focal_x: input.mediaType === "photo" ? (input.focalX ?? null) : null,
      focal_y: input.mediaType === "photo" ? (input.focalY ?? null) : null,
    })
    .select("*")
    .single();
  if (error) throw error;
  if (approved) await bumpLiveRotationEpoch(supabase);
  return data as MediaRow;
}
