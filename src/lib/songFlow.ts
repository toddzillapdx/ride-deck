/** Pure rules for the song-first flow. The songs decide the ride, so these are the numbers the whole builder leans on. */

/** The cool-down starts on the last song's first beat and runs this long; the song then plays on under the stretches. */
export const COOLDOWN_SEC = 120;
/** The first song is the warm-up, start to finish. */
export const FIRST_MIN_SEC = 150;
export const FIRST_MAX_SEC = 210;
/** A few seconds outside 2:30-3:30 is still a fine warm-up (3:31 counts). */
export const FIRST_SLACK_SEC = 15;
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
  if (first?.durationSec !== undefined && (first.durationSec < FIRST_MIN_SEC - FIRST_SLACK_SEC || first.durationSec > FIRST_MAX_SEC + FIRST_SLACK_SEC)) {
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

// ---- arranging a pool of songs by their real lengths ------------------------

/** Extra songs the planner returns beyond what the target needs, so real lengths can be matched afterwards. */
export const SPARES = 4;

export interface PoolSong {
  title: string;
  durationSec?: number;
  intensity?: number;
  /** Planner's position in the energy arc. The arrangement keeps this order. */
  pos?: number;
  /** An alternate the planner offered: dropped first. */
  spare?: boolean;
  locked?: boolean;
  status?: string;
}

export interface Arranged<T> {
  songs: T[];
  /** Songs left out (spares, songs with no length, extras). They stay available for a later re-arrange. */
  bench: T[];
  check: Check;
  ok: boolean;
  problem?: "no-warmup" | "no-cooldown" | "window";
}

const inten = (s: PoolSong) => s.intensity ?? 5;
const MAX_MIDDLE = 20;

/**
 * Choose and order the ride from real lengths.
 * - The warm-up is the easiest song (lowest intensity) that runs 2:30 to 3:30.
 * - The last song is the calmest remaining song of at least 2:00.
 * - The middle keeps the planner's order, minus whatever must go for the ride to land in target..target+2:00
 *   (spares and songs needing a version check go first; locked songs never go).
 */
export function arrange<T extends PoolSong>(pool: T[], targetMin: number): Arranged<T> {
  const sorted = pool.map((s, i) => ({ s, i })).sort((a, b) => (a.s.pos ?? a.i) - (b.s.pos ?? b.i)).map((x) => x.s);
  const usable = sorted.filter((s) => typeof s.durationSec === "number" && s.durationSec > 0);
  const noLength = sorted.filter((s) => !usable.includes(s));
  const fail = (problem: Arranged<T>["problem"]): Arranged<T> => ({ songs: usable, bench: noLength, check: checkSongs(usable.map((s) => ({ title: s.title, durationSec: s.durationSec })), targetMin), ok: false, problem });

  const dur = (s: T) => s.durationSec as number;
  let warms = usable.filter((s) => dur(s) >= FIRST_MIN_SEC && dur(s) <= FIRST_MAX_SEC);
  if (!warms.length) warms = usable.filter((s) => dur(s) >= FIRST_MIN_SEC - FIRST_SLACK_SEC && dur(s) <= FIRST_MAX_SEC + FIRST_SLACK_SEC);
  if (!warms.length) return fail("no-warmup");
  const warm = warms.reduce((best, s) => (inten(s) < inten(best) ? s : best), warms.find((s) => s.locked && usable.indexOf(s) === 0) ?? warms[0]);
  const afterWarm = usable.filter((s) => s !== warm);
  const cools = afterWarm.filter((s) => dur(s) >= LAST_MIN_SEC);
  if (!cools.length) return fail("no-cooldown");
  // Calmest wins; on a tie the later one (it sat nearer the end of the arc).
  const cool = cools.reduce((best, s) => (inten(s) < inten(best) || (inten(s) === inten(best) && afterWarm.indexOf(s) > afterWarm.indexOf(best)) ? s : best));
  const middle = afterWarm.filter((s) => s !== cool).slice(0, MAX_MIDDLE);
  const extra = afterWarm.filter((s) => s !== cool).slice(MAX_MIDDLE);

  const w = windowFor(targetMin);
  const base = dur(warm) + COOLDOWN_SEC;
  const lo = w.minSec - base, hi = w.maxSec - base, mid = (lo + hi) / 2;
  const n = middle.length;
  const dropCost = (s: T) => (s.locked ? 1e6 : s.spare ? 1 : s.status === "doubtful" ? 4 : 10);

  // Locked songs always stay, whatever the target says.
  const lockedMask = middle.reduce((m, s, i) => (s.locked ? m | (1 << i) : m), 0);
  let best: { mask: number; cost: number; off: number } | null = null;
  let closest: { mask: number; gap: number; over: boolean } | null = null;
  for (let mask = 0; mask < 1 << n; mask++) {
    if ((mask & lockedMask) !== lockedMask) continue;
    let sum = 0, cost = 0;
    for (let i = 0; i < n; i++) { if (mask & (1 << i)) sum += dur(middle[i]); else cost += dropCost(middle[i]); }
    if (sum >= lo && sum <= hi) {
      const off = Math.abs(sum - mid);
      if (!best || cost < best.cost || (cost === best.cost && off < best.off)) best = { mask, cost, off };
    } else {
      // For when nothing fits: never choose shorter than the target if it can be avoided.
      const over = sum > hi;
      const gap = over ? sum - hi : lo - sum;
      if (!closest || (!over && closest.over) || (over === closest.over && gap < closest.gap)) closest = { mask, gap, over };
    }
  }
  const pick = best?.mask ?? closest?.mask ?? 0;
  const kept = middle.filter((_, i) => pick & (1 << i));
  const dropped = middle.filter((_, i) => !(pick & (1 << i)));
  const songs = [warm, ...kept, cool];
  const check = checkSongs(songs.map((s) => ({ title: s.title, durationSec: s.durationSec })), targetMin);
  return { songs, bench: [...dropped, ...extra, ...noLength], check, ok: check.state === "ok" && !check.issues.length, ...(best ? {} : { problem: "window" as const }) };
}

/** What stops the soundtrack from being saved. Empty means it is ready. */
export function soundtrackProblems(args: { name: string; songs: PoolSong[]; targetMin: number; check: Check }): string[] {
  const out: string[] = [];
  const { name, songs, check, targetMin } = args;
  if (!name.trim()) out.push("Name the playlist");
  if (songs.length < 3) { out.push("Plan the songs"); return out; }
  const pending = songs.filter((s) => s.status === "pending").length;
  if (pending) out.push(`Looking up ${pending} song length${pending === 1 ? "" : "s"}…`);
  const doubtful = songs.filter((s) => s.status === "doubtful").length;
  if (doubtful) out.push(`Confirm ${doubtful} version${doubtful === 1 ? "" : "s"}`);
  const missing = songs.filter((s) => s.durationSec === undefined && s.status !== "pending" && s.status !== "doubtful").length;
  if (missing) out.push(`${missing} song${missing === 1 ? " needs" : "s need"} a length`);
  for (const i of check.issues) if (i.kind !== "missing") out.push(i.message.replace(/\.$/, ""));
  if (check.state === "short") out.push(`${clock(check.deltaSec)} short of ${targetMin} min`);
  return out;
}
