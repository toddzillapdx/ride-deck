# RideDeck

Ride coach for a Peloton Bike in "Just Ride" mode. A phone or tablet hangs over the bike and runs RideDeck (it is built iPhone-first and scales up). It runs the ride timer, shows target cadence and effort (1 to 10, by feel) per segment, warns before each change, and helps plan music. It does not read any bike data and makes no sound. Full spec: [`RideDeck-build-brief.md`](RideDeck-build-brief.md). Design comps: `1-ride.html` to `4-plan-music.html`.

## Status
| Build step | State |
|---|---|
| 1. Skeleton, ride screen, drift-proof timer | done |
| 2. Change-warning screen, tap-to-stay-awake | done |
| 3. Airtable storage, library, presets, import/export | done (needs env vars set, see below) |
| 4. Workout builder | done (rebuilt for V1.5) |
| 5. Music planner | done (needs `ANTHROPIC_API_KEY`) |
| 6. Ride summary and history | done (V1.5: stretch, finish, calories) |
| V1.5 ride engine (schema v2, effort, intervals, hills, fit to songs) | on branch `ride-engine-v2`, preview only until promoted |

See **V1.5: the v2 ride engine** below for the ride format, the effort scale and how to author a ride.

## Builder
`/builder/new` creates a ride, `/builder/<id>` edits a saved one, and `/builder/new?from=<id>` copies any ride (starter rides always open as a copy, since they are read-only). Details are in **V1.5** below. Saving needs Airtable to be configured.

## Deleting rides

- **Library:** every card has **Delete** (your own rides) or **Remove** (the built-in starter rides), with an in-app confirmation. Deleting your own ride removes it from Airtable for good; rides you already finished stay in History. Removing a starter ride hides it from the library and the music planner on every device. **Restore starter rides** at the bottom of the library brings them back. The choice is stored in one reserved row of the `Rides` table named `__settings__` (the app never shows it as a ride), or only on that device if Airtable isn't connected. Starter rides still open by id, so older History entries can still **Ride again**.
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

**Calories:** type the kcal from the bike on the number pad and Save, or Skip. RideDeck does not read it from the bike. It is a whole number from 0 to 5000. You can add or fix it later on **History** (`/history`), which lists rides newest first with totals, a per-ride chart (tap a segment for its numbers), **Ride again**, and **Delete entry**. If Airtable is unreachable the summary says so and offers Retry.

## Music workflow

1. On your computer open **Plan music** (`/music`), pick a ride, a style and a vibe, and plan a tracklist. **Era** (70s, 80s, 90s, 2000s, 2010s, Now) and **Genre** (Rock, Pop, Hip-hop / Rap, Grunge / Alt, Punk, Metal, Electronic, Country, R&B) are multi-select and optional. Pick one for a focus ("90s" plus "Hip-hop / Rap" is 90s rap), or several for a mix: the songs are spread evenly across every era and every genre you pick, each song is tagged with its style, and a **Spread** line shows the counts. **Sounds like** takes songs, artists or a short note ("Nirvana, Pearl Jam"): they are used as taste seeds for similar songs, never repeated back. Tick **All songs by this artist** under it to play only the artist you typed (or the artist of the song you typed, or several artists spread evenly) instead of similar ones. In that mode era and genre are ignored, the planner reports which artist(s) it understood, and the server drops any song that isn't by them, so you can trust the list. A band with few songs that fit a block's tempo gets their closest fit, and the list may come back short. Tempo comes first, so if a style doesn't fit a block's pace the planner picks the closest fit, and files anything outside your picks as "Other". Songs are paced to each segment: slower and heavier for warm-up, climbs, recovery and cool-down, upbeat for flat and sprint. Lock songs you like, **swap** one song, **redo** a segment, or **regenerate unlocked** for the rest. BPMs and lengths from the planner are estimates, not verified, and songs are suggestions you should check in Amazon Music. Real song lengths only ever come from you or Amazon Music (see below).
2. **Copy prompt + playlist** copies one block: the instructions (name, order, original studio versions, skip what you can't find, no purchases, reply with the share link and the length of each song as `Artist - Title - m:ss`) followed by the numbered songs. Paste it into a Claude in Chrome chat with Amazon Music signed in. **Copy list** (plain `Artist - Title` lines), **Download CSV** and per-song **Find on Amazon** links are there too.
3. Paste the playlist link into the field on the planner and **Save to ride** (starter rides save as a new ride). This saves only the music: it never rewrites a ride's segments. To use real lengths, paste the `Artist - Title - m:ss` lines the Chrome agent returned into the builder's **Songs** box; songs already listed get their length updated, and **Fit to songs** then lines the segments up with the music. On the tablet, the ride screen shows Now and Next songs as a guide, and **Open playlist** opens the link. RideDeck never plays or controls audio.

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
| `AIRTABLE_TOKEN` | Saved rides. A personal access token with `data.records:read` and `data.records:write` on the RideDeck base only. |
| `AIRTABLE_BASE_ID` | The RideDeck base (`app...`). |
| `ANTHROPIC_API_KEY` | Music planner. |
| `PLANNER_PASSCODE` | Optional but recommended. If set, the planner API requires it (the planner screen asks once and remembers it in that browser). Without it anyone who finds the URL can spend your Anthropic credit. |

Without the Airtable vars the app still works with the built-in presets, and the library shows "Airtable not configured". The `Rides` table needs the fields Name, Genre, Vibe, PlaylistUrl, TotalSeconds, WorkoutJson and UpdatedAt. `WorkoutJson` is the source of truth. History lives in a second table, `RideLog`, with Name, RideId, StartedAt, ElapsedSeconds, PlannedSeconds, SegmentsCompleted, SegmentsTotal, Kcal, Notes and SegmentsJson (the same token covers it).

API: `GET/POST /api/rides`, `GET/PUT/DELETE /api/rides/[id]`, `POST /api/music/plan`, `GET/POST /api/history`, `PATCH/DELETE /api/history/[id]`. Presets are read-only (`preset-` ids).

## On the Fire HD 10

Open the deployed URL in Silk and bookmark it. Don't rely on PWA install. Screen Wake Lock is tried first and ignored if Silk lacks it. The real mechanism is the "TAP THE SCREEN" prompt at 10:00 and every 10 minutes after. Any tap dismisses it and resets the countdown.

## Workout JSON
Rides are stored as schema v2 (see **V1.5**). Starter rides are native v2 in `src/lib/presetsV2.ts` (same ids as the v1 starters in `src/lib/presets.ts`). The library's JSON export and import still use the old v1 shape.

## V1.5: the v2 ride engine

Developed on branch `ride-engine-v2` and deployed only as a Vercel preview. Production (`main`) is untouched until you ride the preview and say to promote it.

### Effort replaces resistance

Effort is a 1 to 10 scale judged by feel (the **?** on the effort tile and the **Effort guide** button on the start screen open it):

| Effort | Word | Talk test |
|---|---|---|
| 1-2 | Easy | You could chat all day |
| 3-4 | Comfortable | Full sentences |
| 5-6 | Steady | Short sentences |
| 7 | Hard | A few words at a time |
| 8 | Very hard | Single words; holdable for minutes |
| 9 | Near max | 30 to 60 seconds, tops |
| 10 | All out | 10 to 20 seconds |

Cadence stays an RPM target. "60-70 RPM at effort 8" means you turn your own knob until that cadence feels like an 8. For a range the word is for the upper end.

### The v2 ride format

`WorkoutJson` holds `schemaVersion: 2` and three segment types. A target is a number or a `[min, max]` range.

- **Flat** (`type: "flat"`): steady `cadence` and `effort`, with `role` of `warmup`, `steady`, `recover` or `cooldown`, and `durationSec`.
- **Interval** (`type: "interval"`): `workKind` (`sprint` is fast and light, `resistance` is heavy and slow), `ratio` (`1:1` is 30 on / 30 off, `2:1` is 40 on / 20 off, Tabata-style), `workSec`, `restSec`, `rounds`, optional `finalRestAdjustSec` (added to the last rest, may be negative, so the block can end on a song), and `work` / `rest`, each `{ cadence, effort }`. Length is `rounds * (workSec + restSec) + finalRestAdjustSec`.
- **Hill** (`type: "hill"`): `effortFrom`, `effortTo`, `durationSec` and a steady `cadence`. Effort rises in even steps, one per level (5 to 8 is four levels, so a 4:00 hill is four 1:00 steps); optional `stepSec` overrides the step length.
- Rides also carry `tracklist` entries (`segmentIndex`, `title`, `artist`, `durationSec`, `durationSource`), optional `stretches` (`{ name, holdSec }`), and `sourceId` when the ride is a converted copy of an old one.

The ride engine is pure TypeScript with no React in `src/lib/engine/` (so it can be ported to Swift): `buildPhases`, `phaseAt`, `effortWord`, `validateRide`, `fitSegmentsToSongs`, `convertV1`, `readRide` and the clock core.

### On the ride screen

- **Flat:** effort and cadence tiles for the current phase, with "Was 5 · up 2" under each.
- **Hills:** the effort tile shows the current step, "Up to 7 in 0:20", a progress bar with one slice per step, and a 2 second pulse on the effort number at each step change. There is no full-screen flip between steps.
- **Segment change:** in the last 10 seconds of a segment (only at a segment boundary) the screen flips to ice and shows **HARDER ↑ / EASIER ↓ / SAME** and **FASTER / SLOWER / SAME**.
- **Intervals:** the header reads "INTERVALS · SPRINT · 2:1 · ROUND 3 OF 8", with a huge **WORK** or **REST** and the phase countdown. WORK is the ice screen with dark text, REST is the normal dark screen, round dots show progress, and a giant **3-2-1** covers the last 3 seconds of every phase. The 10-second flip is not used inside an interval.
- **Timeline:** widths are proportional to time. Flat is a plain bar, a hill is a rising wedge, an interval is a row of ticks, one per round.
- The thresholds and colors (10 s flip, 3 s countdown, WORK/REST colors) are named constants in `src/lib/rideTheme.ts`.

### After the last segment

1. **Stretch:** the timer becomes a count-up "STRETCH 0:00", music keeps playing, and a list of stretches (Quads, Hamstrings, Calves, Hip flexors, Glutes, Chest and shoulders, or the ride's own `stretches`) has an optional 30 second visual timer on each.
2. **FINISH RIDE** is always visible and needs no hold.
3. **Calories:** a number pad with Save and a small Skip.
4. Ending early (the hold-to-confirm End ride) goes to the same Calories screen, marked **ended early**.
5. A summary shows total time (ride and stretch), calories if given, and Ride again / Library / History.

History gains three fields on the `RideLog` table: `EndedEarly` (checkbox), `RideSeconds` and `StretchSeconds` (numbers). They are additive.

### Authoring a ride (songs first, then fit)

Real song lengths must come from you or from Amazon Music, never from the AI, because the AI's lengths are guesses. Songs it suggests keep an estimated length that **Fit to songs** refuses to use.

1. Pick or plan your songs in intensity order. Use **Plan music** for ideas, then **Copy prompt + playlist** and paste it into Claude in Chrome. It builds the playlist and reports each song's length.
2. In the builder (`/builder/new`), paste those lines (`Artist - Title - 4:17`) into **Songs**. Lines it can't read are listed, not guessed.
3. Lay out the segments (templates: Warm-up, Cool-down, Intervals 1:1 · 30/30 x 8, Tabata 2:1 · 40/20 x 8, Hill 4 min · effort 5 to 8). A flat segment can cover more than one song (**Songs**); a hill or interval is exactly one song.
4. Press **Fit to songs**. A hill's length equals its song; an interval gets `rounds = round(song / (work + rest))` and a `finalRestAdjustSec` so it ends with the song (a 228 s song at 40/20 is 4 rounds, adjust -12, final rest 8 s; a 250 s song at 30/30 is 4 rounds, adjust +10); a flat segment's length is the sum of its songs. Songs left over play after the ride.
5. The header shows "Segments 27:30 · Music 31:12 · Stretch ~3:40", with warnings for an interval that breaks its ratio, a last rest under 5 s, a one-level hill, and music shorter than the ride. Warnings never block saving.

Playlists you open in Amazon Music drift by a few seconds (gaps, crossfade, versions), so RideDeck never claims to be in sync. The now/next song line is a guide only.

### Old rides

Your v1 rides (resistance 0 to 100) are not rewritten. They are converted when read: `effort = round(resistance / 10)` (floored at 8 for high-cadence work), a v1 climb becomes a hill from where the old ramp actually started up to its peak, and a v1 sprint block becomes a 30/30 interval. `scripts/convert-v1-rides.ts` reads a backup file and prints a review table showing the 30/30 and 40/20 options for every sprint block; `scripts/build-approved.ts` builds the rides that were approved. Both only read and write local files (`/backup/` and `/converted/` are gitignored, since this repo is public). `npm run convert:v1` runs the first.

### Preview data

Preview deployments set `AIRTABLE_RIDES_TABLE=RidesV2` and `AIRTABLE_LEGACY_RIDES_TABLE=Rides`. The preview reads both and writes only `RidesV2`, so your original `Rides` table is never changed. A converted copy carries `sourceId` and replaces its original in the library. The old (v1) builder can't overwrite a v2 ride, and saving a legacy ride makes a converted copy. `RideLog` (History) is shared with production and only gets additive fields. Production sets neither variable, so it reads only `Rides`.

### Testing

`npm test` (vitest) covers the engine (phases for every segment type including a negative `finalRestAdjustSec`, `phaseAt` at every boundary, hill level timing, effort words, v1 conversion, fit to songs, clock pause/resume), the builder model, presets and History. For a quick full ride, run `npm run dev` (or build with `NEXT_PUBLIC_SPEEDUP=1`) and open a ride with `?speed=10` or `?speed=30`. The speed-up is ignored in a normal production build.
