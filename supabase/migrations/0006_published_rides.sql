-- 0006: published (curated) rides, their playlist links, and ride events.
-- Additive: nothing existing changes. Needs 0005 (the admin list and is_admin()). Run it BEFORE deploying the code that uses it.
--
-- The rules live here, in the database, so the app, a script or a mistake cannot get around them:
--   * Only an admin can write rides or playlist links. Riders (signed-in) can read PUBLISHED rides only.
--   * A ride starts as a draft. It can only be published when it has an https link for every service
--     (Spotify, Apple Music, Amazon Music). No ride goes live without playlists.
--   * A published ride cannot lose a link, cannot be deleted (unpublish first), and once it has ever been published its
--     segments are locked (a rider's history must keep matching what they rode). Title, blurb, month and links stay editable.

-- ---- rides ------------------------------------------------------------------------------------------------
create table if not exists public.curated_rides (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  blurb text check (blurb is null or length(blurb) <= 600),
  month text check (month is null or month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- optional, e.g. 2027-01
  ride jsonb not null,                                                           -- the stored ride JSON (schema v2), without an id
  total_seconds int,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz                                                       -- set the first time it is published
);
create index if not exists curated_rides_status_idx on public.curated_rides (status, published_at desc);

-- ---- playlist links: one per ride per service -----------------------------------------------------------------
create table if not exists public.curated_playlists (
  ride_id uuid not null references public.curated_rides (id) on delete cascade,
  service text not null check (service in ('spotify', 'apple', 'amazon')),
  url text not null check (url ~* '^https://[^[:space:]]+$' and length(url) <= 600),
  updated_at timestamptz not null default now(),
  primary key (ride_id, service)
);

-- ---- the rules ----------------------------------------------------------------------------------------------
create or replace function public.curated_rides_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A ride starts as a draft. Add the three playlist links, then publish it.' using errcode = '23514';
    end if;
    new.published_at := null;
    return new;
  end if;
  -- UPDATE
  if new.id <> old.id then raise exception 'A ride''s id cannot change.' using errcode = '23514'; end if;
  if old.published_at is not null and new.ride is distinct from old.ride then
    raise exception 'The segments are locked once a ride has been published. Duplicate it to make a new version.' using errcode = '23514';
  end if;
  if new.status = 'published' and old.status <> 'published' then
    if (select count(distinct p.service) from public.curated_playlists p where p.ride_id = new.id) < 3 then
      raise exception 'Add a playlist link for Spotify, Apple Music and Amazon Music before publishing.' using errcode = '23514';
    end if;
    new.published_at := coalesce(old.published_at, now());
  else
    new.published_at := old.published_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists curated_rides_guard on public.curated_rides;
create trigger curated_rides_guard before insert or update on public.curated_rides for each row execute function public.curated_rides_guard();

create or replace function public.curated_rides_no_delete_live() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'published' then
    raise exception 'Unpublish a ride before deleting it.' using errcode = '23514';
  end if;
  return old;
end $$;
drop trigger if exists curated_rides_no_delete_live on public.curated_rides;
create trigger curated_rides_no_delete_live before delete on public.curated_rides for each row execute function public.curated_rides_no_delete_live();

create or replace function public.curated_playlists_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.ride_id <> old.ride_id or new.service <> old.service then
      raise exception 'A playlist link cannot move to another ride or service.' using errcode = '23514';
    end if;
    new.updated_at := now();
    return new;
  end if;
  -- DELETE: a published ride must keep all three links. (When a draft ride is deleted its links cascade; the ride row is already gone.)
  if exists (select 1 from public.curated_rides r where r.id = old.ride_id and r.status = 'published') then
    raise exception 'A published ride needs all three playlist links. Unpublish it first, or replace the link instead.' using errcode = '23514';
  end if;
  return old;
end $$;
drop trigger if exists curated_playlists_guard on public.curated_playlists;
create trigger curated_playlists_guard before update or delete on public.curated_playlists for each row execute function public.curated_playlists_guard();

-- ---- who can do what (row-level security) -------------------------------------------------------------------------
alter table public.curated_rides enable row level security;
alter table public.curated_playlists enable row level security;
revoke all on public.curated_rides, public.curated_playlists from anon;
grant select, insert, update, delete on public.curated_rides, public.curated_playlists to authenticated;

drop policy if exists curated_rides_read on public.curated_rides;
create policy curated_rides_read on public.curated_rides for select to authenticated
  using (status = 'published' or public.is_admin());
drop policy if exists curated_rides_admin on public.curated_rides;
create policy curated_rides_admin on public.curated_rides for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists curated_playlists_read on public.curated_playlists;
create policy curated_playlists_read on public.curated_playlists for select to authenticated
  using (public.is_admin() or exists (select 1 from public.curated_rides r where r.id = ride_id and r.status = 'published'));
drop policy if exists curated_playlists_admin on public.curated_playlists;
create policy curated_playlists_admin on public.curated_playlists for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- usage events ------------------------------------------------------------------------------------------------
-- What a rider did with a ride, and which music service they use, so the admin can see what is used. Ids and times only.
-- "playlist_opened" is a tap on Open playlist: intent, not proof the music played.
create table if not exists public.ride_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ride_id text not null check (length(ride_id) between 1 and 80),
  service text check (service is null or service in ('spotify', 'apple', 'amazon')),
  kind text not null check (kind in ('opened', 'playlist_opened', 'started', 'finished')),
  created_at timestamptz not null default now()
);
create index if not exists ride_events_ride_idx on public.ride_events (ride_id, kind, created_at);
create index if not exists ride_events_user_idx on public.ride_events (user_id, created_at);
alter table public.ride_events enable row level security;
revoke all on public.ride_events from anon;
grant select, insert on public.ride_events to authenticated;
drop policy if exists ride_events_insert_own on public.ride_events;
create policy ride_events_insert_own on public.ride_events for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists ride_events_admin_read on public.ride_events;
create policy ride_events_admin_read on public.ride_events for select to authenticated
  using (public.is_admin());
