-- RideDeck 0002: accounts. Run in the Supabase SQL editor. Safe to re-run.
--
-- ADDITIVE ONLY: the app still works unchanged afterwards, because it talks to the database with the service
-- key, which bypasses row-level security. Nothing here changes what the current app reads or writes.
-- Order of the accounts rollout: 0002 (this) -> deploy sign-in -> sign up -> supabase/backfill-owner.sql -> 0003.
--
-- Applies to the "public" schema (production, and the new preview project). The old "preview" schema in the
-- first project is not touched and goes away when previews move to their own project.

-- ---- owners ---------------------------------------------------------------------------------------------
-- user_id is nullable for now: existing rows have no owner until backfill-owner.sql runs. A row with no owner
-- is invisible to every signed-in user (the policies below need user_id = auth.uid()).
alter table public.rides        add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.ride_logs    add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.app_settings add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Rows written as a signed-in user get their id automatically. Service-key writes get null (as today).
alter table public.rides        alter column user_id set default auth.uid();
alter table public.ride_logs    alter column user_id set default auth.uid();
alter table public.app_settings alter column user_id set default auth.uid();

create index if not exists rides_user_idx     on public.rides     (user_id, updated_at desc);
create index if not exists ride_logs_user_idx on public.ride_logs (user_id, started_at desc);

-- ---- row-level security: you only ever see your own rows -------------------------------------------------
drop policy if exists rides_own on public.rides;
create policy rides_own on public.rides for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists ride_logs_own on public.ride_logs;
create policy ride_logs_own on public.ride_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists app_settings_own on public.app_settings;
create policy app_settings_own on public.app_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The song-length cache is shared (it holds no personal data). Signed-in users may read it; only the server writes.
drop policy if exists songs_read on public.songs;
create policy songs_read on public.songs for select to authenticated using (true);

-- ---- invite list ------------------------------------------------------------------------------------------
-- Only people on this list can get a sign-in code. Not readable or writable by users at all: the server (service
-- key) and the sign-up hook below are the only readers. exempt = no weekly planner limit (you).
create table if not exists public.invites (
  email text primary key check (email = lower(email)),
  note text,
  exempt boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

-- Sign-up gate inside the database, so direct calls to the auth API cannot create an uninvited account either.
-- Turn it on in the dashboard: Authentication > Hooks > Before User Created > Postgres function > public.hook_before_user_created
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.invites where email = lower(coalesce(event -> 'user' ->> 'email', ''))) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('message', 'RideDeck is invite-only for now.', 'http_code', 403));
end $$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
  end if;
end $$;

-- ---- planner limits ---------------------------------------------------------------------------------------
-- One row per use of the song planner. kind 'plan' = a full "Plan songs"; 'swap' = a one-song swap or add.
-- Users can read their own rows (to show "3 plans left this week") but only the functions below can write.
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('plan', 'swap')),
  created_at timestamptz not null default now()
);
create index if not exists usage_events_user_idx on public.usage_events (user_id, kind, created_at desc);
alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;
grant select on public.usage_events to authenticated;
drop policy if exists usage_own on public.usage_events;
create policy usage_own on public.usage_events for select to authenticated using (user_id = (select auth.uid()));

-- Take one use, or refuse. Atomic per person and kind (no race between two taps). Exempt invites are never refused.
create or replace function public.consume_quota(p_kind text, p_limit int, p_window interval default interval '7 days')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  v_used int; v_oldest timestamptz; v_exempt boolean;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_kind not in ('plan', 'swap') then raise exception 'unknown quota kind %', p_kind; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_kind, 0));
  select coalesce(bool_or(i.exempt), false) into v_exempt from public.invites i where i.email = lower(coalesce(auth.jwt() ->> 'email', ''));
  select count(*), min(created_at) into v_used, v_oldest from public.usage_events where user_id = uid and kind = p_kind and created_at > now() - p_window;
  if not v_exempt and v_used >= p_limit then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', p_limit, 'remaining', 0, 'resets_at', v_oldest + p_window, 'exempt', false);
  end if;
  insert into public.usage_events (user_id, kind) values (uid, p_kind);
  return jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', p_limit, 'remaining', greatest(p_limit - v_used - 1, 0),
    'resets_at', coalesce(v_oldest, now()) + p_window, 'exempt', v_exempt);
end $$;

-- Give one use back (the planner call failed, so the person should not pay for it).
create or replace function public.refund_quota(p_kind text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.usage_events where id = (
    select id from public.usage_events where user_id = auth.uid() and kind = p_kind order by created_at desc limit 1);
$$;

-- How many are left, without using one. For the "3 plans left this week" line.
create or replace function public.quota_status(p_kind text, p_limit int, p_window interval default interval '7 days')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  v_used int; v_oldest timestamptz; v_exempt boolean;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select coalesce(bool_or(i.exempt), false) into v_exempt from public.invites i where i.email = lower(coalesce(auth.jwt() ->> 'email', ''));
  select count(*), min(created_at) into v_used, v_oldest from public.usage_events where user_id = uid and kind = p_kind and created_at > now() - p_window;
  return jsonb_build_object('used', v_used, 'limit', p_limit, 'remaining', case when v_exempt then null else greatest(p_limit - v_used, 0) end,
    'resets_at', case when v_oldest is null then null else v_oldest + p_window end, 'exempt', v_exempt);
end $$;

revoke all on function public.consume_quota(text, int, interval), public.refund_quota(text), public.quota_status(text, int, interval) from public, anon;
grant execute on function public.consume_quota(text, int, interval), public.refund_quota(text), public.quota_status(text, int, interval) to authenticated;
