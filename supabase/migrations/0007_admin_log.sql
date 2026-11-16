-- 0007: a log of what the admin does in the admin console (approved, declined, disabled, ...). Additive. Safe to re-run.
-- Nobody signed in or out can read or write it: only the server (service key) does, after checking the caller is an admin.
create table if not exists public.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_email text not null,
  action text not null,
  target text,
  detail text
);
create index if not exists admin_log_at_idx on public.admin_log (at desc);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;
