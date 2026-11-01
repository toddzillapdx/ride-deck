# RideDeck

Ride coach for a Peloton Bike in "Just Ride" mode. A tablet (Fire HD 10, Silk browser, landscape) hangs over the bike and runs RideDeck. It runs the ride timer, shows target cadence and resistance per segment, warns before each change, and helps plan music. It does not read any bike data and makes no sound. Full spec: [`RideDeck-build-brief.md`](RideDeck-build-brief.md). Design comps: `1-ride.html` to `4-plan-music.html`.

## Status

| Build step | State |
|---|---|
| 1. Skeleton, ride screen, drift-proof timer | done |
| 2. Change-warning screen, tap-to-stay-awake | done |
| 3. Airtable storage, library, presets, import/export | done (needs env vars set, see below) |
| 4. Workout builder | done |
| 5. Music planner | done (needs `ANTHROPIC_API_KEY`) |
| 6. Ride summary and history | done |

## Builder

`/builder/new` creates a ride, `/builder/<id>` edits a saved one, and `/builder/new?from=<id>` copies any ride (presets always open as a copy, since they are read-only). Add segments by type, use the Intervals box for work/rest pairs, reorder with the arrows, duplicate or delete a segment, and leave cadence or resistance blank for no target. Tracks attached by the music planner follow their segment when you reorder or duplicate. Saving needs Airtable to be configured.

## Ride summary and history

When a ride finishes, or you hold **End ride**, RideDeck records it to history right away (ride, start time, time ridden, segments completed, and a snapshot of the targets, so later edits to the ride don't change the past). The finish screen shows the time, segments and a chart of target cadence and resistance by segment, with segments you didn't reach faded.

**Calories:** type the kcal from the Peloton screen into the field and press Save. RideDeck does not read it from the bike. It is a whole number from 0 to 5000, and clearing the field removes it. You can add or fix it later on **History** (`/history`), which lists rides newest first with totals, a per-ride chart (tap a segment for its numbers), **Ride again**, and **Delete entry**. If Airtable is unreachable the finish screen says so and offers Retry, and the calories you typed are included when it retries.

## Music workflow

1. On your computer open **Plan music** (`/music`), pick a ride, genre and vibe, and plan a tracklist. Songs are paced to each segment: slower and heavier for warm-up, climbs, recovery and cool-down, upbeat for flat and sprint. Lock songs you like, **swap** one song, **redo** a segment, or **regenerate unlocked** for the rest. BPMs and lengths are approximate and not verified, and songs are suggestions you should check in Amazon Music.
2. **Copy prompt + playlist** copies one block: the instructions (name, order, original studio versions, skip what you can't find, no purchases, reply with the share link) followed by the numbered songs. Paste it into a Claude in Chrome chat with Amazon Music signed in. **Copy list** (plain `Artist - Title` lines), **Download CSV** and per-song **Find on Amazon** links are there too.
3. Paste the playlist link into the field on the planner and **Save to ride** (presets save as a new ride). On the tablet, the ride screen shows Now and Next songs as a guide, and **Open playlist** opens the link. RideDeck never plays or controls audio.

The planner calls `claude-opus-5-5` from the server route `/api/music/plan` with structured output, low effort and the server-side refusal fallback. Each request fills only the segments being redone, and the server drops repeats, out-of-range segments and bad numbers before anything reaches the page.

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

See section 4 of the brief. Segments have `name`, `type`, `durationSec`, `cadence` and `resistance` (a `[min, max]` range or a single number) and `cue`. Built-in presets live in `src/lib/presets.ts`. Cadence and resistance are optional, so a ride can be timer-only.
