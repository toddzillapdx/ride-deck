/** Pure rules for the song-first flow. The songs decide the ride, so these are the numbers the whole builder leans on. */

/** The cool-down starts on the last song's first beat and runs this long; the song then plays on under the stretches. */
export const COOLDOWN_SEC = 120;
/** The first song is the warm-up, start to finish. */
export const FIRST_MIN_SEC = 150;
export const FIRST_MAX_SEC = 210;
/** The last song must last at least as long as the cool-down. */
export const LAST_MIN_SEC = COOLDOWN_SEC;
/** A ride may run this much over its target. It may never run under. */
export const OVER_SEC = 120;
/** A typical song, for guessing how many to ask for. */
export const AVG_SONG_SEC = 215;

export const TARGET_CHOICES = [20, 30, 45] as const;

export interface Window { minSec: number; maxSec: number }
export const windowFor = (targetMin: number): Window => ({ minSec: targetMin * 60, maxSec: targetMin * 60 + OVER_SEC });

/** Ride length: every song except the last, plus the cool-down. Undefined while a length is missing. */
export function rideSeconds(durations: (number | undefined)[]): number | undefined {
  if (!durations.length) return undefined;
  const before = durations.slice(0, -1);
  if (before.some((d) => d === undefined)) return undefined;
  return before.reduce<number>((t, d) => t + (d as number), 0) + COOLDOWN_SEC;
}

/** How many songs to ask for: enough to fill the target with a short first song, middle songs and a last song. */
export function songsNeeded(targetMin: number): number {
  return Math.max(4, Math.ceil((targetMin * 60 + 30 - COOLDOWN_SEC) / AVG_SONG_SEC) + 1);
}

export type LengthState = "short" | "ok" | "long" | "unknown";
export interface SongIssue { index: number; kind: "first-length" | "last-short" | "missing"; message: string }
export interface Check { rideSec?: number; state: LengthState; /** Positive: seconds short of the minimum. Negative: seconds over the maximum. */ deltaSec: number; issues: SongIssue[] }

const clock = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

export function checkSongs(songs: { title: string; durationSec?: number }[], targetMin: number): Check {
  const issues: SongIssue[] = [];
  songs.forEach((s, index) => { if (s.durationSec === undefined) issues.push({ index, kind: "missing", message: `${s.title}: no length yet.` }); });
  const first = songs[0], last = songs[songs.length - 1];
  if (first?.durationSec !== undefined && (first.durationSec < FIRST_MIN_SEC || first.durationSec > FIRST_MAX_SEC)) {
    issues.push({ index: 0, kind: "first-length", message: `The warm-up song is ${clock(first.durationSec)}. It should be ${clock(FIRST_MIN_SEC)} to ${clock(FIRST_MAX_SEC)}.` });
  }
  if (songs.length > 1 && last?.durationSec !== undefined && last.durationSec < LAST_MIN_SEC) {
    issues.push({ index: songs.length - 1, kind: "last-short", message: `The last song is ${clock(last.durationSec)}. It needs at least ${clock(LAST_MIN_SEC)} for the cool-down.` });
  }
  const rideSec = rideSeconds(songs.map((s) => s.durationSec));
  if (rideSec === undefined) return { state: "unknown", deltaSec: 0, issues };
  const w = windowFor(targetMin);
  if (rideSec < w.minSec) return { rideSec, state: "short", deltaSec: w.minSec - rideSec, issues };
  if (rideSec > w.maxSec) return { rideSec, state: "long", deltaSec: w.maxSec - rideSec, issues };
  return { rideSec, state: "ok", deltaSec: 0, issues };
}

export type Adjust =
  | { action: "none" }
  | { action: "add"; before: number; wantSec: number }
  | { action: "swap"; index: number; wantSec: number }
  | { action: "remove"; index: number };

/**
 * One step toward the target window. Short: swap a middle song for a longer one, or add a song before the last.
 * Long: swap a middle song for a shorter one, or drop one. Aims for the middle of the window so one step usually lands.
 */
export function nextAdjustment(songs: { durationSec?: number; locked?: boolean }[], targetMin: number): Adjust {
  const c = checkSongs(songs.map((s, i) => ({ title: String(i), durationSec: s.durationSec })), targetMin);
  if (c.state === "ok" || c.state === "unknown" || c.rideSec === undefined) return { action: "none" };
  const middle = songs.map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && i < songs.length - 1 && !s.locked && s.durationSec !== undefined);
  const aim = OVER_SEC / 2; // land this far inside the window
  if (c.state === "short") {
    const gap = c.deltaSec + aim;
    if (gap >= 170 || !middle.length) return { action: "add", before: songs.length - 1, wantSec: Math.min(300, Math.max(150, gap)) };
    const pick = middle.sort((a, b) => (a.s.durationSec as number) - (b.s.durationSec as number))[0];
    return { action: "swap", index: pick.i, wantSec: (pick.s.durationSec as number) + gap };
  }
  const over = -c.deltaSec + aim; // seconds to take out to reach the middle of the window
  if (!middle.length) return { action: "none" };
  const pick = middle.sort((a, b) => (b.s.durationSec as number) - (a.s.durationSec as number))[0];
  const want = (pick.s.durationSec as number) - over;
  if (want < 120) return { action: "remove", index: pick.i };
  return { action: "swap", index: pick.i, wantSec: want };
}

/** "Playlist Name ride - 32 min": whole minutes, rounded down. */
export const rideTitle = (playlistName: string, rideSec: number) => `${playlistName.trim() || "Ride"} ride - ${Math.floor(rideSec / 60)} min`;

export type Suggested = { kind: "flat"; role: "warmup" | "steady" | "recover" | "cooldown" } | { kind: "hill" } | { kind: "interval"; work: "sprint" | "resistance" };

/** A starting point for each song's segment from the song's intensity (1-10). The rider changes anything. */
export function suggestSegments(intensities: (number | undefined)[]): Suggested[] {
  let sprint = true;
  return intensities.map((n, i) => {
    if (i === 0) return { kind: "flat", role: "warmup" };
    if (i === intensities.length - 1) return { kind: "flat", role: "cooldown" };
    const v = n ?? 5;
    if (v >= 8) { const work = sprint ? "sprint" : "resistance"; sprint = !sprint; return { kind: "interval", work }; }
    if (v === 7) return { kind: "hill" };
    if (v <= 3) return { kind: "flat", role: "recover" };
    return { kind: "flat", role: "steady" };
  });
}
