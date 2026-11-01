# RideDeck

Ride coach for a Peloton Bike in "Just Ride" mode. A tablet (Fire HD 10, Silk browser, landscape) hangs over the bike and runs RideDeck. It runs the ride timer, shows target cadence and resistance per segment, warns before each change, and helps plan music. It does not read any bike data and makes no sound. Full spec: [`RideDeck-build-brief.md`](RideDeck-build-brief.md). Design comps: `1-ride.html` to `4-plan-music.html`.

## Status

| Build step | State |
|---|---|
| 1. Skeleton, ride screen, drift-proof timer | done |
| 2. Change-warning screen, tap-to-stay-awake | done |
| 3. Airtable storage, library, presets, import/export | next (needs the Airtable base ID) |
| 4. Workout builder | todo |
| 5. Music planner | todo |
| 6. Ride summary and history | todo |

## Local dev

```bash
npm install
npm run dev        # http://localhost:3000
```

Append `?speed=50` to run the clock 50x, which is handy for seeing the 10-second change screen and the 10-minute tap prompt without waiting. The layout is a 1280x800 canvas scaled to fit the viewport.

## Deploy (Vercel)

Import the repo in Vercel, framework preset Next.js. No env vars are needed yet. From step 3 on, set `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID`; from step 5, `ANTHROPIC_API_KEY`. See `.env.example`.

## On the Fire HD 10

Open the deployed URL in Silk and bookmark it. Don't rely on PWA install. Screen Wake Lock is tried first and ignored if Silk lacks it. The real mechanism is the "TAP THE SCREEN" prompt at 10:00 and every 10 minutes after. Any tap dismisses it and resets the countdown.

## Workout JSON

See section 4 of the brief. Segments have `name`, `type`, `durationSec`, `cadence` and `resistance` (a `[min, max]` range or a single number) and `cue`. A sample ride lives in `src/lib/workouts.ts`.
