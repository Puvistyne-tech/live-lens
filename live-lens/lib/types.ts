export type MediaType = "photo" | "video";
export type MediaSource = "pro_camera" | "staff" | "guest";
export type GuestUploadMode = "open" | "moderated" | "invite_code";
export type MediaTag = "dancing" | "portrait" | "group" | "food" | "other" | "wish";
export type LiveDisplayMode = "normal" | "video" | "wish";

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "x"
  | "website"
  | "whatsapp";

export type SocialLink = {
  platform: SocialPlatform;
  url: string;
};

export type MediaRow = {
  id: string;
  url: string;
  thumb_url: string | null;
  preview_url: string | null;
  media_type: MediaType;
  source: MediaSource;
  uploader_name: string;
  duration_ms: number | null;
  approved: boolean;
  depth_map_url: string | null;
  caption: string | null;
  tag: string | null;
  focal_x: number | null;
  focal_y: number | null;
  created_at: string;
};

export type EventSettings = {
  id: string;
  guest_upload_enabled: boolean;
  guest_upload_mode: GuestUploadMode;
  max_photo_bytes: number;
  max_video_bytes: number;
  max_video_seconds: number;
  live_include_guest_video: boolean;
  live_video_sound: boolean;
  live_display_mode: LiveDisplayMode;
  live_sync_enabled: boolean;
  live_rotation_epoch: string;
  live_cta_enabled: boolean;
  live_cta_on_empty: boolean;
  live_cta_on_loop: boolean;
  live_cta_every_n: number;
  live_cta_interval_sec: number;
  couple_names: string | null;
  event_title: string | null;
  event_date: string | null;
  venue_name: string | null;
  venue_address: string | null;
  hero_image_url: string | null;
  welcome_message: string | null;
  wish_prompt: string | null;
  event_social_links: SocialLink[];
  promo_social_links: SocialLink[];
  promo_logo_url: string | null;
  invite_code_prefix: string | null;
  updated_at: string;
};

export type UploadCode = {
  id: string;
  code: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  auto_approve: boolean;
  active: boolean;
  created_at: string;
};
