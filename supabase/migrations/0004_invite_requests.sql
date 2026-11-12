-- RideDeck 0004: "Request an invite" on the welcome page. Run in the SQL editor. Safe to re-run. Additive.
--
-- Requests land here. Nobody signed in or out can read them: only the server (service key) writes, and you read them in
-- the Table Editor. To let someone in:   select public.approve_invite('friend@example.com');
-- Then email them to say they're in (it is manual for now).

create table if not exists public.invite_requests (
  email text primary key check (email = lower(email)),
  note text check (char_length(note) <= 300),
  status text not null default 'new' check (status in ('new', 'invited', 'declined')),
  created_at timestamptz not null default now()
);
create index if not exists invite_requests_created_idx on public.invite_requests (created_at desc);
alter table public.invite_requests enable row level security;
revoke all on public.invite_requests from anon, authenticated;

-- Approve a request (or invite anyone directly): adds them to the invite list and marks the request done.
-- Pass true as the second argument to also remove their weekly planner limit.
create or replace function public.approve_invite(p_email text, p_exempt boolean default false) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare e text := lower(trim(p_email));
begin
  if e = '' or position('@' in e) = 0 then raise exception 'That does not look like an email address.'; end if;
  insert into public.invites (email, note, exempt) values (e, 'approved', p_exempt) on conflict (email) do nothing;
  update public.invite_requests set status = 'invited' where email = e;
  return e || ' is on the invite list.';
end $$;
revoke all on function public.approve_invite(text, boolean) from public, anon, authenticated;
