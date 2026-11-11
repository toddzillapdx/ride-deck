# RideDeck

Ride coach for a Peloton Bike in "Just Ride" mode. A phone or tablet hangs over the bike and runs RideDeck (it is built iPhone-first and scales up). It runs the ride timer, shows target cadence and effort (1 to 10, by feel) per segment, warns before each change, and helps plan music. It does not read any bike data and makes no sound. Full spec: [`RideDeck-build-brief.md`](RideDeck-build-brief.md). Design comps: `1-ride.html` to `4-plan-music.html`.

## Status
| Build step | State |
|---|---|
| 1. Skeleton, ride screen, drift-proof timer | done |
| 2. Change-warning screen, tap-to-stay-awake | done |
| 3. Database storage (Supabase), library, presets, import/export | done (needs env vars set, see below) |
| 4. Workout builder | done (rebuilt for V1.5) |
| 5. Music planner | done (needs `ANTHROPIC_API_KEY`) |
| 6. Ride summary and history | done (V1.5: stretch, finish, calories) |
| V1.5 ride engine (schema v2, effort, intervals, hills, fit to songs) | on branch `ride-engine-v2`, preview only until promoted |

See **V1.5: the v2 ride engine** below for the ride format, the effort scale and how to author a ride.

## Builder
**How it works:** build a ride, plan its music, make a playlist, ride.

- **Library:** every ride has **Details** (read-only: its segments, targets and songs, with **Ride** and **DUPLICATE TO EDIT**) and **Duplicate to edit**. Nothing is edited in place: duplicating opens a copy, and the original stays as it is. Delete a ride you no longer want from its Details page.
- **New ride / duplicate** (`/builder/new`, `/builder/new?from=<id>`) has two tabs: **BUILD RIDE** (segments, templates, songs, Fit to songs) and **PLAN MUSIC** (style, tracklist, copy prompt). One **Save ride** saves both.
- Every segment starts at 4:00, and the templates are 4:00 too (Intervals 1:1 · 30/30 x 4, Tabata 2:1 · 40/20 x 4, Hill 4 min). Change any time with the minutes and seconds boxes.
- The segment type (Flat, Hill, Interval), a flat segment's role, an interval's kind (Sprint or Resistance) and its ratio are buttons, not menus.
- Saving needs the database (Supabase) to be configured.

## Deleting rides

- **Library:** every card has **Delete** (your own rides) or **Remove** (the built-in starter rides), with an in-app confirmation. Deleting your own ride removes it from the database for good; rides you already finished stay in History. Removing a starter ride hides it from the library and the music planner on every device. **Restore starter rides** at the bottom of the library brings them back. The choice is stored in the `app_settings` table (key `main`), or only on that device if the database isn't connected. Starter rides still open by id, so older History entries can still **Ride again**.
- **History:** open a ride and tap **Delete ride**. It asks first, then removes it from History and from your totals.

## On a phone
There is one responsive ride screen, not separate phone and tablet layouts. Portrait stacks the tiles (iPhone first), landscape puts them side by side, and sizes grow with the screen up to a tablet. The ride screen never scrolls and no text on it is under 14px. The library, builder, music planner and history still use the scaled 1280x800 canvas, which is meant for a computer.

- **Pause:** a **Pause** button is always on the ride screen. Pausing stops the clock and shows a full-screen **Paused** screen with a big **Resume** and **Hold to end ride**. Your music app is separate, so pause it there too.
- **Full screen:** on iPhone open the site in Safari, tap Share, then **Add to Home Screen**. On Android Chrome use the menu, then **Install app** or **Add to Home screen**. It then opens without the browser bar (`manifest.ts`, `public/icons`).
- **Switching to the music app:** the ride clock uses the wall clock and the ride in progress is saved on the device, so if the phone suspends or reloads the page while you are in the music app, reopening the same ride picks up where it is (time spent away counts as riding, and a paused ride stays paused). If the segments had already ended it comes back on the stretch screen. Finishing or ending the ride clears the saved state.

## Pacing inside a block
This v1 idea (every sprint block auto-split into 1:00 on/off, every climb auto-ramped) is gone. Intervals and hills are now real segment types with their own numbers (see **V1.5**). Old rides are converted when read.

## Ride summary and history
When the last segment ends the ride does not stop. See **After the last segment** under V1.5: stretch, **FINISH RIDE**, calories, summary. A ride is recorded to History as soon as the segments end (or on an early end), updated at FINISH, and updated again when you save calories. History keeps a snapshot of each segment's targets, so later edits to a ride don't change the past; old rides' resistance shows as effort (resistance / 10).

**Calories:** type the kcal from the bike on the number pad and Save, or Skip. RideDeck does not read it from the bike. It is a whole number from 0 to 5000. You can add or fix it later on **History** (`/history`), which lists rides newest first with totals, a per-ride chart (tap a segment for its numbers), **Ride again**, and **Delete entry**. If the database is unreachable the summary says so and offers Retry.

## Music workflow

1. On your computer open **New ride** (or **Duplicate to edit** on an existing ride), switch to the **PLAN MUSIC** tab, pick a style and a vibe, and plan a tracklist. Every segment gets at least one song, and a hill or an interval gets exactly one. The planner is shown the songs from your other rides so it picks different ones, **swap** replaces exactly one song, and **redo** refills just that segment. **Era** (70s, 80s, 90s, 2000s, 2010s, Now) and **Genre** (Rock, Pop, Hip-hop / Rap, Grunge / Alt, Punk, Metal, Electronic, Country, R&B) are multi-select and optional. Pick one for a focus ("90s" plus "Hip-hop / Rap" is 90s rap), or several for a mix: the songs are spread evenly across every era and every genre you pick, each song is tagged with its style, and a **Spread** line shows the counts. **Sounds like** takes songs, artists or a short note ("Nirvana, Pearl Jam"): they are used as taste seeds for similar songs, never repeated back. Tick **All songs by this artist** under it to play only the artist you typed (or the artist of the song you typed, or several artists spread evenly) instead of similar ones. In that mode era and genre are ignored, the planner reports which artist(s) it understood, and the server drops any song that isn't by them, so you can trust the list. A band with few songs that fit a block's tempo gets their closest fit, and the list may come back short. Tempo comes first, so if a style doesn't fit a block's pace the planner picks the closest fit, and files anything outside your picks as "Other". Songs are paced to each segment: slower and heavier for warm-up, climbs, recovery and cool-down, upbeat for flat and sprint. Lock songs you like, **swap** one song, **redo** a segment, or **regenerate unlocked** for the rest. BPMs and lengths from the planner are estimates, not verified, and songs are suggestions you should check in Amazon Music. Real song lengths only ever come from you or Amazon Music (see below).
2. (On the **PLAN MUSIC** tab of the builder.) **Copy prompt + playlist** copies one block: the instructions (name, order, original studio versions, skip what you can't find, no purchases, reply with the share link and the length of each song as `Artist - Title - m:ss`) followed by the numbered songs. Paste it into a Claude in Chrome chat with Amazon Music signed in. **Copy list** (plain `Artist - Title` lines), **Download CSV** and per-song **Find on Amazon** links are there too.
3. Paste the playlist link into the field on the tab, and paste the `Artist - Title - m:ss` lines the Chrome agent returned into **Use lengths** (or the BUILD RIDE tab's **Songs** box). Songs already listed get their real length, and **Fit to songs** then lines the segments up with the music. **Save ride** saves the segments, songs and link together. On the tablet, the ride screen shows Now and Next songs as a guide, and **Open playlist** opens the link. RideDeck never plays or controls audio.

The planner calls `claude-sonnet-5-5` (half the price of Opus 5.5) from the server route `/api/music/plan` with structured output, low effort and the server-side refusal fallback. The model is one constant, `PLANNER_MODEL` in `src/lib/planner.ts`, if you want to try a different one. Each request fills only the segments being redone, and the server drops repeats, out-of-range segments and bad numbers before anything reaches the page.

## Local dev

```bash
npm install
npm run dev        # http://localhost:3000
```

Append `?speed=50` to run the clock 50x, which is handy for seeing the 10-second change screen and the 10-minute tap prompt without waiting. The layout is a 1280x800 canvas scaled to fit the viewport.

## Deploy (Vercel)

Import the repo in Vercel, framework preset Next.js, and set these in Project Settings, Environment Variables (never in browser code):

| Variable | Needed for |
|---|---|
| `SUPABASE_URL` | The Supabase project URL (rides, history, song cache, settings). |
| `SUPABASE_SECRET_KEY` | The project's secret (service-role) key. Server only. |
| `SUPABASE_DB_SCHEMA` | Leave unset in Production (uses the `public` schema). Set to `preview` for Preview deploys. |
| `ANTHROPIC_API_KEY` | Music planner. |
| `PLANNER_PASSCODE` | Optional but recommended. If set, the planner API requires it (the planner screen asks once and remembers it in that browser). Without it anyone who finds the URL can spend your Anthropic credit. |

Without the Supabase vars the app still works with the built-in presets, and the library shows "Database not configured". Run `supabase/migrations/0001_init.sql` once in the Supabase SQL editor and add `preview` to Project Settings, API, Exposed schemas. Tables (in both `public` and `preview`): `rides` (the ride JSON in `workout`, plus name, genre, vibe, playlist_url, total_seconds, updated_at), `ride_logs` (History), `songs` (the song-length cache), `app_settings`. The browser never talks to Supabase; the server uses the secret key and row-level security has no policies.

### Old rides

Your v1 rides (resistance 0 to 100) are not rewritten. They are converted when read: `effort = round(resistance / 10)` (floored at 8 for high-cadence work), a v1 climb becomes a hill from where the old ramp actually started up to its peak, and a v1 sprint block becomes a 30/30 interval. `scripts/convert-v1-rides.ts` reads a backup file and prints a review table showing the 30/30 and 40/20 options for every sprint block; `scripts/build-approved.ts` builds the rides that were approved. Both only read and write local files (`/backup/` and `/converted/` are gitignored, since this repo is public). `npm run convert:v1` runs the first.

### Preview data

One Supabase project, two schemas. Production reads and writes `public`; Vercel Preview deploys set `SUPABASE_DB_SCHEMA=preview` and use their own copy of every table (rides, history, songs, settings), so a preview ride never lands in production history. A converted copy carries `sourceId` and replaces its original in the library. The old (v1) builder can't overwrite a v2 ride.

### Where the data came from, and backups

RideDeck stored its data in Airtable until 2026-11-11, when it moved to Supabase (rides, history, song cache and settings were copied over with their ids intact, so old history rows keep their `rec...` ids). The Airtable base is kept as a read-only archive and nothing reads it any more. The one-time import scripts are in git history (last present at commit `e3f03f8`: `scripts/import-airtable.ts`, `scripts/verify-import.ts`).

`scripts/backup.ts` dumps the four tables to a timestamped JSON file in `/backup/` (gitignored, since it holds your rides): `npx tsx scripts/backup.ts --schema public` with `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local`. The Supabase free tier has no automatic backups and pauses a project after a week with no activity, so run a backup now and then and ride at least weekly.

### Accounts (in progress)

RideDeck is moving from one owner to private accounts for a small invited group: emailed 6-digit sign-in codes, rides private by default, an invite list, and a weekly limit on the song planner. The database side is in `supabase/` (see `supabase/README.md` for the rollout order and tests). The sign-in screens and route protection come next.

### Testing

`npm test` (vitest) covers the engine (phases for every segment type including a negative `finalRestAdjustSec`, `phaseAt` at every boundary, hill level timing, effort words, v1 conversion, fit to songs, clock pause/resume), the builder model, presets and History. For a quick full ride, run `npm run dev` (or build with `NEXT_PUBLIC_SPEEDUP=1`) and open a ride with `?speed=10` or `?speed=30`. The speed-up is ignored in a normal production build.
