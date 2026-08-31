-- Live wall display mode, cross-device slide sync, and shared rotation epoch
alter table public.event_settings
  add column if not exists live_display_mode text not null default 'normal';

alter table public.event_settings
  add column if not exists live_sync_enabled boolean not null default true;

alter table public.event_settings
  add column if not exists live_rotation_epoch timestamptz not null default now();

alter table public.event_settings
  drop constraint if exists event_settings_live_display_mode_check;

alter table public.event_settings
  add constraint event_settings_live_display_mode_check
  check (live_display_mode in ('normal', 'video', 'wish'));
