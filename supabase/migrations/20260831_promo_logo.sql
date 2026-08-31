-- Studio / photographer promo logo URL
alter table public.event_settings
  add column if not exists promo_logo_url text;
