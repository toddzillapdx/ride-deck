# Database (Supabase)

All SQL lives here. Run migrations in order in the Supabase SQL editor (each is safe to re-run).

| File | What it does | When |
|---|---|---|
| `migrations/0001_init.sql` | Tables: rides, ride_logs, songs, app_settings (public and preview schemas) | Done (2026-11-09) |
| `migrations/0002_accounts.sql` | Adds owners, row-level security, the invite list, the sign-up gate and the weekly planner limits. **Additive: the app keeps working unchanged.** | Accounts rollout, step 1 |
| `backfill-owner.sql` | Gives all existing rows to one account (yours) | After you have signed up on the new sign-in page |
| `migrations/0003_require_owner.sql` | Makes owners required and settings one row per person | Same release as the code for per-user settings |

## Accounts rollout order
1. Create the new preview project, run 0001 and 0002 there first.
2. Run 0002 on production. Nothing changes for the running app (it uses the service key, which bypasses row-level security).
3. Add yourself to the invite list (exempt from the planner limit), in the SQL editor:
   `insert into public.invites (email, exempt, note) values ('YOUR_EMAIL', true, 'owner');`
   Add each invited person the same way, with `exempt` false.
4. Turn on the sign-up gate: Authentication > Hooks > Before User Created > Postgres function > `public.hook_before_user_created`.
5. Ship the sign-in page, sign up, then run `backfill-owner.sql` (edit the email in the editor only).
6. Ship the code that requires sign-in, then run 0003.

## Tests
`npm run test:db` starts a throwaway local Postgres, loads stubs of Supabase's roles and `auth` schema, applies the migrations and checks that:
- people only ever see their own rides, history and settings (and rows with no owner are invisible)
- nobody can write someone else's rows or change an owner
- the song cache is read-only for users, and the invite list is invisible to them
- the weekly limit counts per person and kind, refuses past the limit, forgets uses older than 7 days, refunds, and never refuses the owner
- the backfill and 0003 work, and deleting an account removes all of its data

It needs PostgreSQL 14 or newer installed (server binaries `initdb` and `pg_ctl`). It never touches a real database.
