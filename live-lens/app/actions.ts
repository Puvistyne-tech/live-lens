"use server";

import { createPresignedUpload } from "@/lib/r2";
import { createServiceSupabase } from "@/lib/supabase/server";
import { checkPassword, isAdmin, isStaff, setRoleCookie, clearRoleCookies } from "@/lib/auth";
import type { EventSettings, GuestUploadMode, MediaRow } from "@/lib/types";

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
  const row = data as EventSettings & { invite_code_prefix?: string | null };
  return {
    ...row,
    invite_code_prefix: row.invite_code_prefix ?? null,
    max_video_seconds: row.max_video_seconds ?? 10,
  };
}

export async function getApprovedMediaAction(limit = 40): Promise<MediaRow[]> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("media")
    .select("*")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []) as MediaRow[];
}

export async function getAllMediaAction(): Promise<MediaRow[]> {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const { data } = await supabase.from("media").select("*").order("created_at", { ascending: false }).limit(200);
  return (data || []) as MediaRow[];
}

export async function setMediaApprovedAction(id: string, approved: boolean) {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("media").update({ approved }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}

export async function deleteMediaAction(id: string) {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("media").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

export async function updateSettingsAction(patch: Partial<EventSettings>) {
  if (!(await isAdmin())) throw new Error("Unauthorized");
  const supabase = createServiceSupabase();
  const allowed: (keyof EventSettings)[] = [
    "guest_upload_enabled",
    "guest_upload_mode",
    "max_photo_bytes",
    "max_video_bytes",
    "max_video_seconds",
    "live_include_guest_video",
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
  const { error } = await supabase
    .from("event_settings")
    .update({ ...safe, updated_at: new Date().toISOString() })
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
  return data as MediaRow;
}
