> **Historical document.** This is the original build brief. Storage has since moved from Airtable to Supabase; see the README for how the app works now.

# RideDeck: build brief for Claude Code

Build "RideDeck", a ride-coach web app (Next.js + TypeScript + Tailwind, deployed on Vercel). Todd rides a Peloton Bike in "Just Ride" mode and reads his real cadence and resistance on the bike's own display. A tablet hangs over the bike and runs RideDeck. **RideDeck does not read, measure, or interpret any bike data.** It runs the ride timer, shows target cadence and target resistance for each segment, warns before each change, and helps plan music. He self-regulates.

Ship fast and collaboratively. Get a deployed skeleton first (timer plus one hard-coded workout using the real design), then layer on the rest. Ask only for blocking decisions. Commit in small steps.

## 1. Locked decisions

- **Target device:** Amazon Fire HD 10 (11th gen), Silk browser, landscape only. Design canvas is 1280 x 800 CSS px. Scale the layout to the viewport (design at 1280x800, scale to fit) so it also holds if the real viewport differs. Silk is a normal browser tab (bookmark it). Do not rely on PWA install.
- **No audio of any kind.** No beeps, no voice, no Web Audio or Speech API, no vibration. Music comes only from the native Amazon Music app running separately on the tablet. RideDeck must never touch audio or interrupt it.
- **Visual-only coaching.** Segment changes are signaled by a full-screen color flip, a countdown, and the new targets (see screen 2).
- **Screen stays on by tapping.** Developer Options is unavailable and the sleep timeout is 30 minutes. Try the Screen Wake Lock API first and fail silently if Silk lacks it, but do not depend on it. Build a tap prompt into the ride: at 10:00 of elapsed ride time and every 10 minutes after, show the "TAP THE SCREEN" banner (screen 3). Any tap anywhere dismisses it and resets the next-prompt countdown. If it is ignored, keep it up and make it more prominent (pulse). The ride timer keeps running throughout. The ride screen always shows a "Screen tap in M:SS" chip counting down to the next prompt.
- **Timer is in-page.** Drive elapsed time from timestamps (`Date.now()` / `performance.now()` deltas), not by counting interval ticks, so it stays accurate if the tab is throttled. Pause and resume must account for paused time.
- **Storage:** Todd's Airtable (a new dedicated base). The app talks to Airtable only through Next.js API routes. The Airtable token lives in a Vercel environment variable (`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`), never in browser code. Rides planned on his computer must show up on the tablet.
- **Music workflow:** plan on the computer, ride on the tablet. On the computer he picks a ride and genre, the app suggests a tracklist paced to the segments, and he exports it. A separate Claude chat (Claude in Chrome) then builds the playlist in Amazon Music from the pasted list, and he saves the playlist link back onto the ride. On the tablet, the ride screen has an "Open playlist" button that opens that link (it should open the Amazon Music app if the OS allows). Do not attempt direct Amazon Music API integration.
- **Out of scope:** Bluetooth, ANT+, camera/OCR, any reading of Peloton metrics, accounts, Peloton's power zones/FTP, audio cues.

## 2. Design system (palette A, Peloton-style type)

### Colors

| Token | Hex | Use |
|---|---|---|
| ground | `#002A33` | Screen background; dark text on light surfaces |
| tile | `#003B46` | Tiles, cards, panels |
| line | `#07575B` | Tile borders, timeline segments, chip outlines, dividers |
| mist | `#66A5AD` | Resistance color; muted labels and secondary text |
| ice | `#C4DFE6` | Cadence color; primary accent; flash background; primary buttons |
| text | `#F4F5F7` | Body text on dark |

Cadence is always ice. Resistance is always mist. Colors do not change with the number. `ground` is a darkened shade of `#003B46` chosen so numerals have strong contrast.

### Type (Montserrat, self-host with `next/font` so it works offline; weights 200, 300, 400, 500)

- Numerals: weight 300 (countdown and flash numbers weight 200), line-height 1, letter-spacing -0.03em.
- Labels: 13-15px, weight 500, uppercase, letter-spacing 0.14-0.2em, color mist (or the metric color).
- Body: weight 300-400, letter-spacing about 0.01em.
- Minimum text size 13px. Touch targets at least 44px, buttons 60px high.

### Shape and spacing

- Screen padding 36px top, 56px sides, 40px bottom; 24px gaps between major sections.
- Tiles: radius 28px, 2px `line` border, padding 28px 36px. Cards: radius 20px. Pills and buttons fully rounded. Timeline segments radius 6px.
- Flat. No gradients or shadows.

## 3. Screens (build to these specs; sample numbers are illustrative)

### Screen 1: Ride (steady state)

Top row, three columns:
- Left: label ELAPSED (13px), value 52px, weight 300.
- Center: label "CLIMB · SEGMENT 3 OF 7" (14px, ice), then the **segment countdown at 88px, weight 200**.
- Right: label REMAINING, value 52px, right-aligned.

Timeline: a 28px-high row of segments, widths proportional to duration, 6px gaps. Past segments filled `line`. Current segment: `tile` fill, 2px ice border, ice progress fill. Future segments: `tile` fill with 2px `line` border.

Two tiles side by side, equal width, 24px gap:
- CADENCE tile: label (15px, ice) and unit "RPM" (mist) on one line; target range at **140px, weight 300, ice** (e.g. "60–70"); footer "Was 85–95 · down 25" (17px, mist).
- RESISTANCE tile: label (15px, mist) and "0–100" (mist); target range at 140px, weight 300, mist (e.g. "55–65"); footer "Was 40–50 · up 15".
- Targets are ranges or single values; render either. "Was ... · up/down N" compares to the previous segment's target midpoint.

Cue row (44px): the segment's cue text (24px, weight 300) on the left, and a "Screen tap in M:SS" chip (14px, mist, hand icon, 2px `line` border) on the right.

Bottom row (128px, two cards, 24px gap):
- Next up (flex 1.3): label "NEXT UP · IN M:SS", then "SPRINT · 3:00 110–120 RPM 30–40" (22px; RPM range ice, resistance range mist).
- Music (flex 1.5): label "MUSIC · CLIMB"; "Now: <song> · <artist>" (19px); "Next: <song> · <artist>" (15px, mist); and an ice "Open playlist" pill button (60px high, ground text, music-note icon). Now/next song is a visual guide computed from elapsed time and the tracklist; RideDeck does not play or control music.

### Screen 2: Segment change warning (last 10 seconds)

The entire screen background flips to **ice** with ground-colored text.
- Top strip: "ELAPSED 14:53 · REMAINING 15:07" and "SEGMENT 4 OF 7" (14px, weight 500, uppercase).
- Center, two blocks side by side (72px gap): left "CHANGE IN" (16px label) with the **seconds countdown at 300px, weight 200**; right "NEXT" label, the next segment's name at **150px, weight 200** (e.g. SPRINT), and a 22px line "3:00 · <next cue>".
- Bottom: two ground-colored cards (236px high, radius 24px): CADENCE with the new range at 84px (ice) plus a direction word at top right ("FASTER ↑" or "SLOWER ↓") and "from <old range>" (17px, mist); RESISTANCE likewise (mist) with "LIGHTER ↓" or "HEAVIER ↑".
- Direction words compare the new target to the old. If a value is unchanged, show "SAME".

### Screen 3: Tap to keep awake

The ride screen stays visible at 40% opacity underneath. On top, a full-width ice banner (radius 36px, 300px high): hand icon, "TAP THE SCREEN" at 80px weight 300 in ground color, and "Keeps the tablet awake. Your ride keeps running." (20px). Appears at 10:00 elapsed and every 10 minutes after; any tap dismisses it.

### Screen 4: Plan music (used on the computer, but must work at tablet size)

Left column (340px): title "PLAN MUSIC" (34px weight 300); RIDE selector cards (selected has ice border); GENRE chips (Rock, Pop, Hip-hop, Electronic, Country, R&B, 80s); VIBE chips (Classic, High energy, Recent); a full-width ice "Plan tracklist" button. Selected chips fill ice with ground text; unselected have a 2px `line` outline.

Right column: label "TRACKLIST · ROCK · CLASSIC" and heading "7 songs · 30:00 ride"; buttons "Copy list", "Download CSV" (outlined), "Save to ride" (ice fill). Then one row per song (64px high, `tile` fill, radius 14px): a segment chip (132px: e.g. "WARM-UP 5:00"), title (17px) over artist (13px, mist), approximate BPM like "~120", and a "Find on Amazon" link (mist) that opens an Amazon Music search for that song. Segment chip styles: warm-up, recover, cool-down use `line` fill; flat uses mist fill with ground text; climb uses ice fill with ground text; sprint is an ice outline with ice text. Footer note: "Sample songs. BPMs are approximate, not verified. Swap or regenerate any row before you build the playlist."

Row actions to include: swap a song, regenerate one segment, lock a song so regeneration skips it, and show total playlist length against ride length.

## 4. Data model

Workouts are JSON, importable and exportable (so Claude chats can generate new rides to paste in):

```json
{
  "id": "hills-sprints-30",
  "name": "30 min · Hills and sprints",
  "genre": "Rock",
  "vibe": "Classic",
  "playlistUrl": "",
  "segments": [
    { "name": "Warm-up", "type": "warmup", "durationSec": 300, "cadence": [70, 80], "resistance": [20, 30], "cue": "Easy spin. Loosen up." },
    { "name": "Flat road", "type": "flat", "durationSec": 300, "cadence": [85, 95], "resistance": [40, 50], "cue": "Find a steady rhythm." },
    { "name": "Climb", "type": "climb", "durationSec": 300, "cadence": [60, 70], "resistance": [55, 65], "cue": "Heavy and slow. Stay seated, shoulders loose." },
    { "name": "Sprint", "type": "sprint", "durationSec": 180, "cadence": [110, 120], "resistance": [30, 40], "cue": "Fast legs, stand if you want." },
    { "name": "Recover", "type": "recover", "durationSec": 120, "cadence": [70, 80], "resistance": [25, 35], "cue": "Breathe. Let your heart rate drop." },
    { "name": "Climb", "type": "climb", "durationSec": 300, "cadence": [60, 70], "resistance": [60, 70], "cue": "Dig in. One more big climb." },
    { "name": "Cool-down", "type": "cooldown", "durationSec": 300, "cadence": [65, 75], "resistance": [15, 25], "cue": "Easy spin. Nice work." }
  ],
  "tracklist": [
    { "segmentIndex": 0, "title": "Dreams", "artist": "Fleetwood Mac", "approxBpm": 120 }
  ]
}
```

Cadence is RPM, resistance is the Peloton 0-100 knob scale. A target may be a range `[min, max]` or a single number. `approxBpm` is informational only and never presented as verified.

Airtable (new base "RideDeck"): table `Rides` with fields Name, Genre, Vibe, PlaylistUrl, TotalSeconds, WorkoutJson (long text, the full JSON above), UpdatedAt. Keep it to one table for v1. API routes: list rides, get ride, create, update, delete.

## 5. Features

1. **Ride player:** the 3 screens above driven by the selected workout. Controls (large, hard to hit by accident): start, pause/resume, skip segment, previous segment, end ride (hold to confirm). Auto-advance on segment end. The segment-change screen appears for the last 10 seconds of every segment.
2. **Ride library:** list saved rides from Airtable, pick one, start. Include 5-6 preset rides (20-min beginner, 30-min hills and sprints, 45-min endurance, 20-min HIIT, hill repeats, a free ride with a timer only).
3. **Workout builder:** create/edit/duplicate/delete rides, add and reorder segments (up/down buttons), quick templates (warm-up, intervals work/rest x N, hill climb, cool-down), import/export JSON.
4. **Music planner (phase 2):** screen 4. A server route calls the Claude API (`ANTHROPIC_API_KEY` in a Vercel env var, never in the browser) with the ride's segments (type, duration, cadence, resistance) plus genre and vibe, and returns JSON tracklist entries per segment (title, artist, approxBpm, short reason). Pace songs to the segment: slower and heavier for warm-up, climbs, recover, and cool-down; upbeat for flat and sprints. Songs should roughly fill each segment's duration. Export as plain text ("Artist - Title" per line), CSV, and a per-song "Find on Amazon" search link. Save the tracklist and the playlist URL onto the ride.
5. **Ride summary:** total time, segments completed, a simple timeline of target cadence and resistance, saved to a history list, with a "ride again" button.

## 6. Build order

1. Skeleton: Next.js app, Montserrat via `next/font`, design tokens in Tailwind config, deployed to Vercel. Ride screen 1 with the hard-coded sample workout and a drift-proof timer.
2. Segment-change screen 2 and tap-to-stay-awake screen 3 with their timing rules, tested by speeding the clock.
3. Airtable storage and API routes, ride library, presets, import/export.
4. Workout builder.
5. Music planner (screen 4) and playlist link handling.
6. Ride summary and history.

## 7. Deliverables

A working repo with a README covering local dev, Vercel deploy with the three env vars, adding the Silk bookmark on the Fire HD 10, the workout JSON format, and the music workflow (plan on the computer, build the playlist in Amazon Music via Claude in Chrome, paste the playlist link into the ride). Before building the Airtable layer, ask me for the base ID.
