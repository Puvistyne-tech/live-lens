import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function insertProPhoto(supabase, opts) {
  const {
    url,
    thumbUrl = null,
    previewUrl = null,
    depthMapUrl = null,
    caption = null,
    tag = null,
  } = typeof opts === "string" ? { url: opts } : opts;

  const { data, error } = await supabase
    .from("media")
    .insert({
      url,
      thumb_url: thumbUrl,
      preview_url: previewUrl,
      depth_map_url: depthMapUrl,
      caption,
      tag,
      media_type: "photo",
      source: "pro_camera",
      uploader_name: "Pro Camera",
      approved: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateMediaTag(supabase, id, { caption = null, tag = null } = {}) {
  const { error } = await supabase
    .from("media")
    .update({ caption, tag })
    .eq("id", id)
    .is("tag", null);
  if (error) throw error;
}

export async function updateMediaAi(
  supabase,
  id,
  { depthMapUrl = null, caption = null, tag = null } = {},
) {
  const patch = {};
  if (depthMapUrl != null) patch.depth_map_url = depthMapUrl;
  if (caption != null) patch.caption = caption;
  if (tag != null) patch.tag = tag;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase.from("media").update(patch).eq("id", id);
  if (error) throw error;
}
