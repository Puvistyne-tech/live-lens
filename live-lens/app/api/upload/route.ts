import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client, publicUrlForKey } from "@/lib/r2";
import { uploadImageVariants } from "@/lib/image-variants";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isStaff } from "@/lib/auth";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/**
 * Proxied upload — avoids browser→R2 CORS issues (phones on LAN, etc.).
 * Prefer this when direct presigned PUT fails with "Failed to fetch".
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const role = String(form.get("role") || "guest");
    const mediaType = String(form.get("mediaType") || "photo") as "photo" | "video";
    const uploaderName = String(form.get("uploaderName") || "");
    const inviteCode = String(form.get("inviteCode") || "");
    const tagRaw = String(form.get("tag") || "").trim().toLowerCase();
    const captionRaw = String(form.get("caption") || "").trim().slice(0, 120);
    const tag = tagRaw === "wish" ? "wish" : null;
    const caption = captionRaw || null;
    const durationMsRaw = form.get("durationMs");
    const durationMs = durationMsRaw ? Number(durationMsRaw) : null;
    const focalXRaw = form.get("focalX");
    const focalYRaw = form.get("focalY");
    const focalX =
      focalXRaw != null && focalXRaw !== "" && Number.isFinite(Number(focalXRaw))
        ? Math.min(1, Math.max(0, Number(focalXRaw)))
        : null;
    const focalY =
      focalYRaw != null && focalYRaw !== "" && Number.isFinite(Number(focalYRaw))
        ? Math.min(1, Math.max(0, Number(focalYRaw)))
        : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const supabase = createServiceSupabase();
    const { data: settings } = await supabase
      .from("event_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (!settings) {
      return NextResponse.json({ error: "Settings missing" }, { status: 500 });
    }

    let approved = false;
    let source: "guest" | "staff" = "guest";

    if (role === "staff") {
      if (!(await isStaff())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      approved = true;
      source = "staff";
    } else {
      if (!settings.guest_upload_enabled) {
        return NextResponse.json({ error: "Guest upload disabled" }, { status: 403 });
      }
      if (settings.guest_upload_mode === "open") approved = true;
      else if (settings.guest_upload_mode === "moderated") approved = false;
      else {
        const { data: code } = await supabase
          .from("upload_codes")
          .select("*")
          .eq("code", inviteCode.trim().toUpperCase())
          .eq("active", true)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        if (!code || code.uses >= code.max_uses) {
          return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
        }
        approved = code.auto_approve;
        await supabase.from("upload_codes").update({ uses: code.uses + 1 }).eq("id", code.id);
      }
    }

    const isVideo = mediaType === "video";
    if (isVideo && durationMs != null && Number.isFinite(durationMs)) {
      const maxMs = (settings.max_video_seconds || 10) * 1000;
      if (durationMs > maxMs + 500) {
        return NextResponse.json({ error: "Video too long" }, { status: 400 });
      }
    }
    if (isVideo && file.size > Number(settings.max_video_bytes || 0)) {
      return NextResponse.json({ error: "Video exceeds size limit" }, { status: 400 });
    }
    if (!isVideo && tag !== "wish" && file.size > Number(settings.max_photo_bytes || 0)) {
      return NextResponse.json({ error: "Photo exceeds size limit" }, { status: 400 });
    }

    const ext = isVideo
      ? (file.name.split(".").pop() || "mp4").toLowerCase()
      : "jpg";
    const contentType = isVideo ? file.type || "video/mp4" : "image/jpeg";
    const key = `${source}/${Date.now()}-${randomUUID()}.${ext}`;

    const body = Buffer.from(await file.arrayBuffer());
    const client = createR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    const publicUrl = publicUrlForKey(key);
    let thumbUrl: string | null = null;
    let previewUrl: string | null = null;
    if (!isVideo) {
      const variants = await uploadImageVariants(body, key);
      if (variants) {
        thumbUrl = variants.thumbUrl;
        previewUrl = variants.previewUrl;
      }
    }

    const { data, error } = await supabase
      .from("media")
      .insert({
        url: publicUrl,
        thumb_url: thumbUrl,
        preview_url: previewUrl,
        media_type: mediaType,
        source,
        uploader_name: uploaderName || (source === "staff" ? "Staff" : "Guest"),
        duration_ms: durationMs,
        approved,
        tag,
        caption,
        focal_x: mediaType === "photo" ? focalX : null,
        focal_y: mediaType === "photo" ? focalY : null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, media: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
