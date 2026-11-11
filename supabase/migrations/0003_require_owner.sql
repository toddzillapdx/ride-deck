-- RideDeck 0003: every row must have an owner. Run ONLY after supabase/backfill-owner.sql has given your existing
-- rows to your account, and in the same release that ships the code which writes per-user settings
-- (the app_settings key changes from "key" to "user_id + key", so the old single-owner code must be gone). Safe to re-run.

do $$
declare n int;
begin
  select (select count(*) from public.rides where user_id is null)
       + (select count(*) from public.ride_logs where user_id is null)
       + (select count(*) from public.app_settings where user_id is null) into n;
  if n > 0 then
    raise exception 'Run supabase/backfill-owner.sql first: % row(s) still have no owner.', n;
  end if;
end $$;

alter table public.rides        alter column user_id set not null;
alter table public.ride_logs    alter column user_id set not null;
alter table public.app_settings alter column user_id set not null;

-- Settings become one row per person per key.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_settings'::regclass and contype = 'p' and pg_get_constraintdef(oid) like '%(user_id, key)%'
  ) then
    alter table public.app_settings drop constraint if exists app_settings_pkey;
    alter table public.app_settings add primary key (user_id, key);
  end if;
end $$;
