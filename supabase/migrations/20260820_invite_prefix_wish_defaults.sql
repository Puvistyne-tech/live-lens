-- LiveLens: invite prefix + wish video default duration
alter table public.event_settings
  add column if not exists invite_code_prefix text;

alter table public.event_settings
  alter column max_video_seconds set default 10;

update public.event_settings
set max_video_seconds = 10
where id = 'default' and max_video_seconds = 5;
