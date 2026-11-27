-- RideDeck 0008: the invite request also says which music service the person uses and one song they love to ride to.
-- Run in the SQL editor of BOTH Supabase projects (preview and production) BEFORE the matching app version goes live.
-- Safe to re-run. Additive: existing requests keep working (both columns stay empty for them).

alter table public.invite_requests add column if not exists service text;
alter table public.invite_requests add column if not exists favorite_song text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invite_requests_service_check') then
    alter table public.invite_requests add constraint invite_requests_service_check check (service is null or service in ('spotify', 'amazon', 'apple', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invite_requests_song_check') then
    alter table public.invite_requests add constraint invite_requests_song_check check (favorite_song is null or char_length(favorite_song) <= 150);
  end if;
end $$;
