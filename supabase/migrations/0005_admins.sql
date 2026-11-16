-- 0005: the admin role (curator). Additive: nothing existing changes, and the app keeps working if this is run first.
-- Admin is its own list, deliberately NOT a column on invites: invites is edited by hand (typos, approvals) and "exempt"
-- means "no weekly planner limit", which must never grant admin. Not readable or writable by users at all: the server
-- (service key) and is_admin() are the only readers.
create table if not exists public.admins (
  email text primary key check (email = lower(email)),
  note text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- Is the signed-in person an admin? Used by the server (a signed-in client calls it) and by row-level-security policies
-- in later migrations. SECURITY DEFINER so it can read the admins table; it only ever answers about the caller.
-- The email comes from the signed-in session (verified by the emailed code), never from anything the browser sends.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
