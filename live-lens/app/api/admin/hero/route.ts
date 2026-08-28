import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client, publicUrlForKey } from "@/lib/r2";
import { isAdmin } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Image required" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const key = `branding/hero-${Date.now()}-${randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
    const body = Buffer.from(await file.arrayBuffer());
    const client = createR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: key,
        Body: body,
        ContentType: file.type || "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    const publicUrl = publicUrlForKey(key);
    const supabase = createServiceSupabase();
    const { error } = await supabase
      .from("event_settings")
      .update({ hero_image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", "default");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
