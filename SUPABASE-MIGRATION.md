# RideDeck: Airtable to Supabase build brief (for Claude Code)

Written 2026-11-09 for Todd. Supersedes the earlier plan doc `claude/ridedeck-supabase-migration-2026-11-09.md` (same analysis, now with decisions locked).
Repo: `toddzillapdx/ride-deck` (public). Base branch: `claude/v2-song-first` (head `3b4d2c5`). Work branch: `claude/supabase`.

## 0. Kickoff prompt (paste this into Claude Code)

> Read `SUPABASE-MIGRATION.md` in the repo root and follow it phase by phase. Create branch `claude/supabase` from `claude/v2-song-first`. Stop at every GATE and wait for me. Never merge to `main`, never write to Airtable, never print or commit a secret. Run `npx vitest run` after each phase; all tests must stay green. Keep every API response shape unchanged so no UI code needs to change.

Save this file as `SUPABASE-MIGRATION.md` at the repo root of the work branch (it has no secrets). Delete it after cutover.

## 1. Why, and the decisions already made

- Airtable Free allows 1,000 API calls per workspace per month (resets on the 1st, UTC). RideDeck and the toddames.com Field Notes site share one workspace and are at about 1,200. Todd is in the one-time 30-day grace period; after it, calls return HTTP 429 until the monthly reset. RideDeck must be off Airtable before the grace period ends.
- RideDeck's call volume is structural: every route is `force-dynamic`, every Airtable fetch is `no-store`, and the song cache costs about 2 calls per song.

Decisions (final):

1. One Supabase project, two schemas: `public` = production, `preview` = Vercel preview deploys. Chosen by env var `SUPABASE_DB_SCHEMA` (unset means `public`).
2. The read-only legacy-table behavior (`AIRTABLE_LEGACY_RIDES_TABLE`, `__legacy`, `hasLegacy`) is dropped. After import all rides live in one `rides` table per schema.
3. Preview history is separate: `preview.ride_logs` is its own table. Production history is never touched by preview rides.
4. Ship V2 and Supabase in one release (the branch is based on `claude/v2-song-first`, so merging it to `main` ships both). Todd decides when to merge.

## 2. Hard constraints (from Todd, carry over from the handoff)

- Do not merge to `main` or change production until Todd says so.
- Do not write to Airtable (read-only access only, and only from the import script).
- No secrets in chat, the repo, or `.env` files that get committed. Secrets live in Vercel env vars and Todd's local `.env.local` (gitignored). Never echo them.
- `/backup/` and `/converted/` are gitignored. Todd's rides must never be committed to this public repo.
- Do not touch UI behavior: no audio, text 14px or larger, ride screen never scrolls, sprint effort 4-6, hills recover 20 s. This task changes the data layer only.
- API contract: keep every route's request and response JSON shapes identical, including the `configured` flag, `skipped` list, and error `status` codes.
- Sandbox gotcha: Node `fetch` needs `NODE_USE_ENV_PROXY=1` behind the proxy. Do not run `next dev` and `next start` from the same folder.

## 3. What exists today (read before editing)

All Airtable access is in two files.

`src/lib/airtable.ts` exports: `SETTINGS_NAME`, `AirtableNotConfigured`, `airtableConfigured`, `toFields`, `fromRecord`, `isV2`, `listRides`, `getRide`, `getRideRaw`, `createRide`, `updateRide`, `deleteRide`, `toFieldsV2`, `createRideV2`, `updateRideV2`, `patchRideMeta`, `RideMeta`, `toLogFields`, `fromLogRecord`, `listLogs`, `createLog`, `updateLog`, `deleteLog`, `AppSettings`, `getSettings`, `putSettings`.

`src/lib/songs/cache.ts` exports: `CachedSong`, `readCache`, `writeCache`, `toCached`.

Routes that import the first file: `/api/rides`, `/api/rides/[id]`, `/api/history`, `/api/history/[id]`, `/api/settings`. `/api/songs/resolve` uses the cache.

Also grep for `airtable` (case-insensitive). Other hits are mostly comments, messages and docs: `Builder.tsx`, `HistoryView.tsx`, `Library.tsx`, `PostRide.tsx`, `engine/convertV1.ts`, `hiddenPresets.ts`, `historyClient.ts`, `presets.ts`, `presetsV2.ts`, `scripts/convert-v1-rides.ts`, `README.md`, `RideDeck-build-brief.md`, `.env.example`, `__tests__/airtable-v2.test.ts`. Update wording where user-facing; do not change logic there.

Behaviors that must be preserved exactly:

- **Name and playlist overrides.** A ride's `name` and `playlist_url` columns win over the same fields inside the JSON (today: "edited directly in Airtable, those edits win").
- **JSON excludes id.** `workout` jsonb stores the ride JSON without `id` (same as `WorkoutJson` today). The row id is injected on read.
- **v2 rides in the library.** `fromRecord` turns a v2 ride into a v1-shaped `Workout` through `readRide` + `rideToLegacyWorkout` + extras. `getRideRaw` returns the stored JSON untouched with `id` set. Keep both.
- **Converted copies.** `listRides` hides an original when another ride's JSON has `sourceId` pointing at it. Keep the `replaced` filter.
- **Unreadable rides.** `listRides` puts unparseable rows' ids in `skipped` instead of failing.
- **Old builder guard.** `PUT /api/rides/[id]` with a v1 body refuses (409) when the stored ride is v2 (`isV2`).
- **`patchRideMeta`.** Reads the ride, `readRide`s it, merges the meta (tracklist, playlistUrl, genre, vibe, eras, genres, seeds, artistOnly), writes back in place. With legacy dropped it never creates a copy; for a stored v1 ride it converts in place (id stays), `sourceId` stays as `base.sourceId`.
- **Logs.** `updateLog` patch semantics: `kcal: null` clears; `notes: null/""` clears; only provided fields change. `listLogs` returns newest first by `started_at`.
- **Settings.** `hiddenPresets` string array; the route still filters to known preset ids.
- **Song cache is best effort.** `readCache`/`writeCache` must never throw; `writeCache` returns boolean.
- **Writes set `updated_at = now()`** in code (as `UpdatedAt` is set today).

## 4. Target schema

Create `supabase/migrations/0001_init.sql` (apply once in the Supabase SQL editor; idempotent where practical).

```sql
-- Production schema: public
create table if not exists public.rides (
  id text primary key default gen_random_uuid()::text,   -- migrated rows keep their Airtable rec id
  name text not null,
  genre text, vibe text, playlist_url text,
  total_seconds int,
  workout jsonb not null,                                 -- former WorkoutJson, without id
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
```

Todd must also expose the `preview` schema in the Supabase dashboard (Project Settings, API, Exposed schemas). Menu names may differ slightly.

## 5. Environment variables

| Var | Production | Preview | Local (`.env.local`) |
|---|---|---|---|
| `SUPABASE_URL` | yes | yes | yes |
| `SUPABASE_SECRET_KEY` (the project's secret / service-role key) | yes | yes | yes |
| `SUPABASE_DB_SCHEMA` | unset | `preview` | `preview` (until cutover) |
| `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` | remove at cutover | remove after import | only while importing |

Update `.env.example` (names only, no values). Remove `AIRTABLE_RIDES_TABLE`, `AIRTABLE_LEGACY_RIDES_TABLE`, `AIRTABLE_SONGS_TABLE` from docs.

## 6. Build phases

### Phase A: baseline (no edits)
1. `git checkout claude/v2-song-first && git checkout -b claude/supabase`.
2. `npm ci`, then `npx vitest run`, `npx tsc --noEmit`, `npm run build`. Expect 132 tests passing. Record the baseline.

### Phase B: schema and client
1. Add `supabase/migrations/0001_init.sql` from section 4.
2. `npm i @supabase/supabase-js`.
3. Create `src/lib/db/client.ts` (server-only): reads `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_SCHEMA`; `createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: schema ?? "public" } })`; export `dbConfigured()`; export a typed `NotConfigured` error (replaces `AirtableNotConfigured`) and a typed `NotFound` error (replaces matching `/Airtable 404/` in messages). Add `import "server-only"` if the package is already available; otherwise a comment is enough. The client must never be imported from a client component.

### Phase C: data layer
Create `src/lib/db/rides.ts`, `logs.ts`, `settings.ts`, and `src/lib/db/index.ts` (re-exports). Make the pure row converters separately exported and unit-testable: `rowToWorkout`, `workoutToRow`, `rideToRow`, `logToRow`, `rowToLog`. Functions take an optional injected client for tests.

| Old | New |
|---|---|
| `listRides()` | one `select * order by updated_at desc` (no paging loop; if rows could exceed 1,000, page with `range`), keep `replaced` filter and `skipped` |
| `getRide`, `getRideRaw`, `isV2` | `select ... eq('id', id).maybeSingle()`; throw `NotFound` if missing; apply name/playlist overrides |
| `createRide`, `createRideV2` | insert, return `rowToWorkout` |
| `updateRide`, `updateRideV2` | update by id, set `updated_at`; `NotFound` if no row |
| `deleteRide` | delete by id |
| `patchRideMeta` | read, merge meta, update in place (see section 3) |
| `listLogs` | `select * order by started_at desc` |
| `createLog`, `updateLog`, `deleteLog` | insert / patch / delete on `ride_logs` (same patch semantics) |
| `getSettings` | `select value from app_settings where key='main'`; default `{ hiddenPresets: [] }` |
| `putSettings` | single `upsert` on key `main` |
| `songs/cache.readCache` | one `.in('key', keys)`; swallow errors, return empty map |
| `songs/cache.writeCache` | one `upsert({ onConflict: 'key' })`; return boolean, never throw |

Delete `src/lib/airtable.ts` only in Phase H. Until then keep it so the import script (Phase E) can read from Airtable. Then move its read code into the script.

### Phase D: routes and call sites
1. In the five routes and `/api/songs/resolve`, swap imports to `@/lib/db`. Keep response shapes, including `configured` (now `dbConfigured()`).
2. Replace the `/Airtable 404/` status sniffing in `fail()` with `instanceof NotFound` (404) and `instanceof NotConfigured` (503), else 502.
3. `api/history/[id]/route.ts`: replace the `rec...` id regex with one that accepts both formats: `/^(rec[A-Za-z0-9]{14}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i`. Check any other code that assumes the `rec` prefix (grep `rec[A-Za-z0-9]` and `"rec"`), including ride id validation in client or builder code.
4. Remove legacy plumbing: `hasLegacy`, `LEGACY`, `__legacy` flag handling in the builder and any UI that reads `__legacy` (grep it). A v1 ride now saves in place. The builder guard that refuses overwriting v2 stays.
5. Update user-facing text that says "Airtable".
6. Preview isolation check: with `SUPABASE_DB_SCHEMA=preview` every function must read and write only the `preview` schema, including history and songs.

### Phase E: tests
1. Port `src/lib/__tests__/airtable-v2.test.ts` to the new converters (`workoutToRow`, `rideToRow`, `rowToWorkout`, `logToRow`, `rowToLog`), covering the override rules, v2 adapter path, `skipped`, `replaced`, `patchRideMeta` in-place conversion, and `updateLog` null-clearing.
2. Add an in-memory fake of the small Supabase query surface used (`from().select/insert/update/upsert/delete/eq/in/order/maybeSingle`) so the db functions are tested without a network.
3. Keep all 132 existing tests green. Add the new ones on top.
4. `npx tsc --noEmit` and `npm run build` clean.

### Phase F: import and verify scripts
Create `scripts/import-airtable.ts` (run with `npx tsx`; never executed in CI, never on Vercel).

- Reads Airtable read-only with `AIRTABLE_TOKEN`/`AIRTABLE_BASE_ID` from the local environment. Total cost is roughly 6 to 10 calls (a handful of list pages), which fits the grace period.
- Sources and targets (target schema from `--schema`, default `preview`):
  - `Rides` (production rides) -> `rides` (keep `id` = Airtable rec id; `name`, `genre`, `vibe`, `playlist_url`, `total_seconds`, `workout` = parsed `WorkoutJson`, `updated_at` from `UpdatedAt`).
  - `RidesV2` -> `preview.rides` only (these are preview test rides; do not import into `public`).
  - `RideLog` -> `ride_logs` (`ride_id` from `RideId`, `segments` = parsed `SegmentsJson`, snake_case fields).
  - `Songs` -> `songs`.
  - The `__settings__` row in Rides -> `app_settings` key `main`. Skip it as a ride.
- For `--schema preview`: import production `Rides` + `RidesV2` + `Songs` + settings. Do **not** import `RideLog` (preview history starts empty and separate).
- For `--schema public`: import `Rides` (excluding settings), `RideLog`, `Songs`, settings. Not `RidesV2`.
- Use batched `upsert` on `id`/`key` so re-running is safe. Support `--dry-run` that prints counts only. Never print ride contents or secrets.
- Fallback if the Airtable API is blocked (429): accept CSV exports from `/backup/`. In Airtable add a formula field `RecId = RECORD_ID()` to each table before exporting so ids can be preserved. That is an additive schema change Todd must do himself.

Create `scripts/verify-import.ts`: for the chosen schema, check row counts against the source counts, run every ride's `workout` through `readRide`/`validateRide` (report ids that fail), check every `ride_logs.ride_id` is a ride id or a starter preset id, and check `sourceId` hiding works. Output is counts and ids only.

Create `scripts/backup.ts`: dumps all four tables of the chosen schema to timestamped JSON in `/backup/` (gitignored). Free Supabase has no automatic backups.

### GATE 1 (stop and tell Todd)
Code complete, tests and build green. Todd then does:
1. Create the Supabase project; run `0001_init.sql` in the SQL editor; expose the `preview` schema.
2. Put `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_SCHEMA=preview` in `.env.local` and the Vercel Preview env; put the first two in Vercel Production env too (do not deploy production yet).
3. Run `npx tsx scripts/import-airtable.ts --schema preview --dry-run`, then for real, then `npx tsx scripts/verify-import.ts --schema preview`.
4. Remove `AIRTABLE_*` from the Vercel Preview env so any leftover Airtable call fails loudly.

### Phase G: preview verification checklist
On the preview deploy of `claude/supabase`: library lists all rides; each starter and saved ride loads on the ride screen; plan songs (song cache reads/writes land in `preview.songs`); save a soundtrack and a ride; ride one and finish with calories; History shows only the new row; edit a log's calories; delete a test log; hide a starter preset and see it persist across a reload. Todd confirms with a real ride.

### GATE 2 (stop and tell Todd)
Todd rides the preview and says go.

### Phase H: production cutover (Todd runs these; Claude Code only prepares the checklist)
1. `npx tsx scripts/import-airtable.ts --schema public --dry-run`, then for real, then verify. This writes only to Supabase.
2. Run `scripts/backup.ts` once and keep the JSON.
3. Merge `claude/supabase` to `main` (ships V2 + Supabase together). Vercel Production env has the two Supabase vars and no `SUPABASE_DB_SCHEMA`.
4. Smoke test production: `/`, `/builder/new`, one ride, a history write.
5. Rollback: promote the previous deployment in Vercel. It still reads Airtable, so it only works while the grace period or the monthly reset allows it. The real safety net is the untouched Airtable base plus the JSON backup.

### Phase I: cleanup (1 to 2 weeks after cutover, only if stable)
1. Delete `src/lib/airtable.ts`, the Airtable branch of `songs/cache`, the import script's Airtable code (or archive the script), `AIRTABLE_*` references, README text. Remove `AIRTABLE_*` from Vercel Production.
2. Leave the Airtable base as a read-only archive.
3. Optional keep-alive: Supabase Free pauses after one week of inactivity. Add a `vercel.json` daily cron hitting a tiny `/api/health` route that selects one row from `app_settings`. Hobby allows daily crons. Riding weekly also counts as activity.
4. Weekly `scripts/backup.ts` (Todd's call whether to automate).
5. Update README's data section.

## 7. Done means

- All tests green (132 existing plus new ones), typecheck and build clean.
- No Airtable import left in `src/` except the import script (until Phase I).
- With `SUPABASE_DB_SCHEMA=preview`, nothing touches `public`; with it unset, nothing touches `preview`.
- Every API route returns the same JSON shapes as before.
- Song planning a 12-song ride makes at most 2 database calls for the cache (1 read plus upserts per song, no per-song find).
- No secrets or ride data in the repo or in output.

## 8. Not in scope here

Apple MusicKit written answer, Anthropic API cost per ride, name/trademark check, pricing, SwiftUI vs Expo, Field Notes / toddames.com caching (separate repo and change).
