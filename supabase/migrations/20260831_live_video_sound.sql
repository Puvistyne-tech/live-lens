-- Live wall: admin default for video sound (viewers still get an unmute control)
alter table public.event_settings
  add column if not exists live_video_sound boolean not null default false;
