-- Give every existing ride, history row and setting to ONE account (yours). Run once in the Supabase SQL editor,
-- after you have signed up through the new sign-in page. Replace YOUR_EMAIL_HERE with the email you signed up with.
-- (Keep your real email out of the repo: edit it in the SQL editor only, never save it back to this file.)
-- Safe to re-run: it only touches rows that have no owner yet.

do $$
declare
  owner_email text := lower('YOUR_EMAIL_HERE');
  uid uuid;
  r int; l int; s int;
begin
  select id into uid from auth.users where lower(email) = owner_email;
  if uid is null then
    raise exception 'No account found for %. Sign up first, and use the same email here.', owner_email;
  end if;
  update public.rides        set user_id = uid where user_id is null; get diagnostics r = row_count;
  update public.ride_logs    set user_id = uid where user_id is null; get diagnostics l = row_count;
  update public.app_settings set user_id = uid where user_id is null; get diagnostics s = row_count;
  raise notice 'Gave % ride(s), % history row(s) and % setting(s) to the account for %.', r, l, s, owner_email;
end $$;
