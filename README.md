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

## Deleting rides

- **Library:** every card has **Delete** (your own rides) or **Remove** (the built-in starter rides), with an in-app confirmation. Deleting your own ride removes it from Airtable for good; rides you already finished stay in History. Removing a starter ride hides it from the library and the music planner on every device. **Restore starter rides** at the bottom of the library brings them back. The choice is stored in one reserved row of the `Rides` table named `__settings__` (the app never shows it as a ride), or only on that device if Airtable isn't connected. Starter rides still open by id, so older History entries can still **Ride again**.
- **History:** open a ride and tap **Delete ride**. It asks first, then removes it from History and from your totals.

## On a phone

Phones (short side under 600 px) get their own layout instead of the scaled tablet canvas: the library, the whole ride (start screen, ride, change warning, tap prompt, pause, finish) and history, in landscape and portrait. Target numbers are sized to fill their tile, buttons are thumb-sized, and the layout pads for notches and the home indicator. Tablets and desktops keep the 1280x800 canvas. Building rides and planning music stay on the canvas layout, which is meant for a computer.

- **Pause:** a **Pause** button is always on the ride screen (phone and tablet). Pausing stops the clock and shows a full-screen **Paused** screen with a big **Resume** and **Hold to end ride**. Your music app is separate, so pause it there too.
- **Full screen:** on iPhone open the site in Safari, tap Share, then **Add to Home Screen**. On Android Chrome use the menu, then **Install app** or **Add to Home screen**. It then opens without the browser bar (`manifest.ts`, `public/icons`).
- **Switching to the music app:** the ride clock uses the wall clock and the ride in progress is saved on the device, so if the phone suspends or reloads the page while you are in the music app, reopening the same ride picks up where it is (time spent away counts as riding, and a paused ride stays paused). Ending the ride or finishing it clears the saved state.

## Pacing inside a block

A ride is stored as blocks, one per song. At ride time each block is split into minute-by-minute steps, so you never add them by hand (`src/lib/pacing.ts`):

- **Sprint blocks:** 1:00 on, 1:00 off, repeating for the length of the block (a 3:00 sprint is on, off, on). The off minutes use recover targets, 70-80 RPM at 25-35 resistance. A 3:45 block ends with a 0:45 off.
- **Climb blocks:** one step per minute, with resistance higher every minute by about 5 points. The resistance you set on the climb is its **peak**, so it never gets harder than that number. A long climb is capped at a 25 point total rise.
- **Everything else:** one steady step. Blocks of about 1:30 or less stay a single step, so the HIIT preset is unchanged.

On the ride screen the label shows the step ("CLIMB · SEGMENT 3 OF 7 · MIN 3 OF 5", "SPRINT … ON", "RECOVER … OFF"), the big countdown is the current step, and the timeline still shows blocks. The change warning is 10 seconds before a real change and 5 seconds between climb minutes. In the builder each sprint or climb block has a **Pacing** choice (Auto, Steady, 1:00 on/off, Ramp up) and shows what it will ride as. Skip and Previous move by block.

## Ride summary and history

When a ride finishes, or you hold **End ride**, RideDeck records it to history right away (ride, start time, time ridden, segments completed, and a snapshot of the targets, so later edits to the ride don't change the past). The finish screen shows the time, segments and a chart of target cadence and resistance by segment, with segments you didn't reach faded.

**Calories:** type the kcal from the Peloton screen into the field and press Save. RideDeck does not read it from the bike. It is a whole number from 0 to 5000, and clearing the field removes it. You can add or fix it later on **History** (`/history`), which lists rides newest first with totals, a per-ride chart (tap a segment for its numbers), **Ride again**, and **Delete entry**. If Airtable is unreachable the finish screen says so and offers Retry, and the calories you typed are included when it retries.

## Music workflow

1. On your computer open **Plan music** (`/music`), pick a ride, a style and a vibe, and plan a tracklist. **Era** (70s, 80s, 90s, 2000s, 2010s, Now) and **Genre** (Rock, Pop, Hip-hop / Rap, Grunge / Alt, Punk, Metal, Electronic, Country, R&B) are multi-select and optional. Pick one for a focus ("90s" plus "Hip-hop / Rap" is 90s rap), or several for a mix: the songs are spread evenly across every era and every genre you pick, each song is tagged with its style, and a **Spread** line shows the counts. **Sounds like** takes songs, artists or a short note ("Nirvana, Pearl Jam"): they are used as taste seeds for similar songs, never repeated back. Tick **All songs by this artist** under it to play only the artist you typed (or the artist of the song you typed, or several artists spread evenly) instead of similar ones. In that mode era and genre are ignored, the planner reports which artist(s) it understood, and the server drops any song that isn't by them, so you can trust the list. A band with few songs that fit a block's tempo gets their closest fit, and the list may come back short. Tempo comes first, so if a style doesn't fit a block's pace the planner picks the closest fit, and files anything outside your picks as "Other". Songs are paced to each segment: slower and heavier for warm-up, climbs, recovery and cool-down, upbeat for flat and sprint. Lock songs you like, **swap** one song, **redo** a segment, or **regenerate unlocked** for the rest. BPMs and lengths are approximate and not verified, and songs are suggestions you should check in Amazon Music.
2. **Copy prompt + playlist** copies one block: the instructions (name, order, original studio versions, skip what you can't find, no purchases, reply with the share link) followed by the numbered songs. Paste it into a Claude in Chrome chat with Amazon Music signed in. **Copy list** (plain `Artist - Title` lines), **Download CSV** and per-song **Find on Amazon** links are there too.
3. Paste the playlist link into the field on the planner and **Save to ride** (presets save as a new ride). On the tablet, the ride screen shows Now and Next songs as a guide, and **Open playlist** opens the link. RideDeck never plays or controls audio.

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

See section 4 of the brief. Segments have `name`, `type`, `durationSec`, `cadence` and `resistance` (a `[min, max]` range or a single number) and `cue`. Built-in presets live in `src/lib/presets.ts`. Cadence and resistance are optional, so a ride can be timer-only.
