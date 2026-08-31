-- Optional framing text shown on /wish camera phase
alter table public.event_settings
  add column if not exists wish_prompt text;
