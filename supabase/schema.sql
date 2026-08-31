-- LiveLens core schema (applied via MCP; kept in-repo for reference)

create extension if not exists pgcrypto;

create type public.media_type as enum ('photo', 'video');
create type public.media_source as enum ('pro_camera', 'staff', 'guest');
create type public.guest_upload_mode as enum ('open', 'moderated', 'invite_code');

create table public.media (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  thumb_url text,
  preview_url text,
  media_type public.media_type not null default 'photo',
  source public.media_source not null,
  uploader_name text not null default 'Anonymous',
  duration_ms integer,
  approved boolean not null default false,
  depth_map_url text,
  caption text,
  tag text,
  focal_x double precision,
  focal_y double precision,
  created_at timestamptz not null default now()
);

create index media_approved_created_at_idx on public.media (approved, created_at desc);
create index media_source_idx on public.media (source);
create index media_tag_idx on public.media (tag);

create table public.event_settings (
  id text primary key default 'default',
  guest_upload_enabled boolean not null default false,
  guest_upload_mode public.guest_upload_mode not null default 'moderated',
  max_photo_bytes bigint not null default 5242880,
  max_video_bytes bigint not null default 26214400,
  max_video_seconds integer not null default 10,
  live_include_guest_video boolean not null default true,
  live_video_sound boolean not null default false,
  live_display_mode text not null default 'normal'
    check (live_display_mode in ('normal', 'video', 'wish')),
  live_sync_enabled boolean not null default true,
  live_rotation_epoch timestamptz not null default now(),
  couple_names text,
  event_title text,
  event_date text,
  venue_name text,
  venue_address text,
  hero_image_url text,
  welcome_message text,
  invite_code_prefix text,
  updated_at timestamptz not null default now()
);

insert into public.event_settings (id) values ('default') on conflict do nothing;

create table public.upload_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  expires_at timestamptz not null,
  max_uses integer not null default 50,
  uses integer not null default 0,
  auto_approve boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index upload_codes_code_idx on public.upload_codes (code);

alter table public.media enable row level security;
alter table public.event_settings enable row level security;
alter table public.upload_codes enable row level security;

create policy media_select_approved
  on public.media for select
  to anon, authenticated
  using (approved = true);

create policy event_settings_select
  on public.event_settings for select
  to anon, authenticated
  using (true);

create policy upload_codes_select_active
  on public.upload_codes for select
  to anon, authenticated
  using (active = true and expires_at > now() and uses < max_uses);
