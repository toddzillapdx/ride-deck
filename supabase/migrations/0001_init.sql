-- RideDeck: Supabase schema. Run once in the Supabase SQL editor. Safe to re-run.
-- public  = production
-- preview = Vercel preview deploys (chosen at runtime by the SUPABASE_DB_SCHEMA env var)

create table if not exists public.rides (
  id text primary key default gen_random_uuid()::text,   -- migrated rows keep their Airtable rec id
  name text not null,
  genre text, vibe text, playlist_url text,
  total_seconds int,
  workout jsonb not null,                                 -- the ride JSON, without id
  updated_at timestamptz not null default now()
);
create index if not exists rides_updated_idx on public.rides (updated_at desc);

create table if not exists public.ride_logs (
  id text primary key default gen_random_uuid()::text,
  ride_id text,                                           -- ride id or a starter preset id
  name text, started_at timestamptz not null,
  elapsed_sec int, planned_sec int, segments_completed int, segments_total int,
  kcal numeric, notes text, ended_early boolean not null default false,
  ride_seconds int, stretch_seconds int,
  segments jsonb not null default '[]'
);
create index if not exists ride_logs_started_idx on public.ride_logs (started_at desc);

create table if not exists public.songs (
  key text primary key,
  artist text, title text, duration_sec int not null,
  source text not null check (source in ('deezer','typed')),
  album text, deezer_id text, isrc text,
  confirmed boolean not null default false,
  fetched_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Preview schema: identical shape, separate data
create schema if not exists preview;
create table if not exists preview.rides         (like public.rides         including all);
create table if not exists preview.ride_logs     (like public.ride_logs     including all);
create table if not exists preview.songs         (like public.songs         including all);
create table if not exists preview.app_settings  (like public.app_settings  including all);

-- Server-only access: RLS on, no policies. The browser never talks to Supabase.
alter table public.rides        enable row level security;
alter table public.ride_logs    enable row level security;
alter table public.songs        enable row level security;
alter table public.app_settings enable row level security;
alter table preview.rides        enable row level security;
alter table preview.ride_logs    enable row level security;
alter table preview.songs        enable row level security;
alter table preview.app_settings enable row level security;

-- A custom schema needs explicit grants for the service role
grant usage on schema preview to service_role;
grant all on all tables in schema preview to service_role;
alter default privileges in schema preview grant all on tables to service_role;

-- After running this: Supabase dashboard > Project Settings > API > Exposed schemas: add "preview".
