# Database (Supabase)

All SQL lives here. Run migrations in order in the Supabase SQL editor (each is safe to re-run).

| File | What it does | When |
|---|---|---|
| `migrations/0001_init.sql` | Tables: rides, ride_logs, songs, app_settings (public and preview schemas) | Done (2026-11-09) |
| `migrations/0002_accounts.sql` | Adds owners, row-level security, the invite list, the sign-up gate and the weekly planner limits. **Additive: the app keeps working unchanged.** | Accounts rollout, step 1 |
| `backfill-owner.sql` | Gives all existing rows to one account (yours) | After you have signed up on the new sign-in page |
| `migrations/0003_require_owner.sql` | Makes owners required and settings one row per person | Same release as the code for per-user settings |
| `migrations/0004_invite_requests.sql` | The "Request an invite" table and `approve_invite(email)` | With the welcome page |
| `migrations/0005_admins.sql` | The admin (curator) list and `is_admin()`. **Additive; run it BEFORE deploying the code that checks it.** | Admin role, stage A1 |
| `migrations/0006_published_rides.sql` | Published rides, their playlist links (Spotify, Apple Music, Amazon Music) and ride events. Needs 0005. **Run it BEFORE deploying the code that uses it.** | Published rides, stage A2 |

## Letting someone in
People ask on the welcome page; requests appear in the `invite_requests` table (Table Editor). To approve one, run in the SQL editor:
`select public.approve_invite('friend@example.com');` (add `, true` as a second argument to remove their weekly planner limit.)
Then email them to say they can sign in with that address. To invite someone who never asked, run the same line.

## Accounts rollout order
1. Create the new preview project, run 0001 and 0002 there first.
2. Run 0002 on production. Nothing changes for the running app (it uses the service key, which bypasses row-level security).
3. Add yourself to the invite list (exempt from the planner limit), in the SQL editor:
   `insert into public.invites (email, exempt, note) values ('YOUR_EMAIL', true, 'owner');`
   Add each invited person the same way, with `exempt` false.
4. Turn on the sign-up gate: Authentication > Hooks > Before User Created > Postgres function > `public.hook_before_user_created`.
5. Ship the sign-in page, sign up, then run `backfill-owner.sql` (edit the email in the editor only).
6. Ship the code that requires sign-in, then run 0003 (and 0004).

The app switches to accounts mode when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set: pages and data routes then need a signed-in person, every request runs as that person, and the song planner is limited per week (`PLAN_WEEKLY_LIMIT`, default 5 full plans; `SWAP_WEEKLY_LIMIT`, default 30 swaps). Without them the app runs as before.

## Tests
`npm run test:db` starts a throwaway local Postgres, loads stubs of Supabase's roles and `auth` schema, applies the migrations and checks that:
- people only ever see their own rides, history and settings (and rows with no owner are invisible)
- nobody can write someone else's rows or change an owner
- the song cache is read-only for users, and the invite list is invisible to them
- the weekly limit counts per person and kind, refuses past the limit, forgets uses older than 7 days, refunds, and never refuses the owner
- the backfill and 0003 work, and deleting an account removes all of its data

It needs PostgreSQL 14 or newer installed (server binaries `initdb` and `pg_ctl`). It never touches a real database.

## The admin role (0005)
Only admins can build, edit, delete or plan rides (the builder, the music planner and song lookups). Everyone else signed in can see rides, ride them and use History. The list is its own table, not a column on `invites`: "exempt from limits" must never grant admin.

Order matters: run `0005_admins.sql`, **add yourself**, then deploy. The code asks the database `is_admin()` on every admin action and treats a failed check as "no", so deploying first would lock everyone (including you) out of the builder until the migration is in.

Add an admin (SQL editor; use the exact address you sign in with, lowercase):
`insert into public.admins (email, note) values ('you@example.com', 'curator');`
List: `select email, note from public.admins;`  Remove: `delete from public.admins where email = 'you@example.com';`

## Published rides (0006)
`curated_rides` holds the rides riders see; `curated_playlists` holds one link per ride per service; `ride_events` records what riders do (opened, playlist opened, started, finished, with their music service). The rules are enforced by the database, not just the app:
- Only an admin can write rides or links. Riders can read published rides and their links, never drafts.
- A ride starts as a draft. It can only be published when it has an https link for **all three** services.
- A published ride cannot lose a link and cannot be deleted (unpublish first). Once a ride has ever been published its segments are locked (so a rider's History keeps matching what they rode). Title, description, month and links stay editable. To change segments, make a new version (a copy as a new draft).
- A rider can record their own events and nobody can read them except the admin.

Deploy order (do these in order): 1) run `0006_published_rides.sql` in the SQL editor, 2) check it with `select count(*) from public.curated_rides;` (should return 0), 3) then merge and deploy the code. The code is safe to deploy only after the tables exist.

Playlists are added in the app: open a saved ride's details, tap **Publish as curated ride**, paste the three links on the page that opens, and tap Publish.
