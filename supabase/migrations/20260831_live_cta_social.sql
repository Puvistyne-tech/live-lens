-- Live share CTA triggers + event/promo social link lists
alter table public.event_settings
  add column if not exists live_cta_enabled boolean not null default true,
  add column if not exists live_cta_on_empty boolean not null default true,
  add column if not exists live_cta_on_loop boolean not null default true,
  add column if not exists live_cta_every_n integer not null default 0,
  add column if not exists live_cta_interval_sec integer not null default 0,
  add column if not exists event_social_links jsonb not null default '[]'::jsonb,
  add column if not exists promo_social_links jsonb not null default '[]'::jsonb;
