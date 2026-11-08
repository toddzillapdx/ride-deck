import { MIN_FINAL_REST_SEC, type FlatSegment, type HillSegment, type IntervalSegment, type RideSegment, type RideTrack, type Warning } from "./types";

/** A segment laid over songs. Durations are derived from the songs; any in the template are ignored. */
export type FitTemplate =
  | (Omit<FlatSegment, "durationSec"> & { songs?: number })
  | (Omit<IntervalSegment, "rounds" | "finalRestAdjustSec"> & { songs?: never })
  | (Omit<HillSegment, "durationSec" | "stepSec"> & { songs?: never });

export interface Song {
  title: string;
  artist: string;
  /** Required. Songs without a real length are refused. */
  durationSec?: number;
  durationSource?: string;
}

export interface FitResult {
  ok: boolean;
  segments: RideSegment[];
  tracklist: RideTrack[];
  /** Songs left over after the last segment (music may run longer than the ride). */
  unused: Song[];
  errors: string[];
  warnings: Warning[];
}

/**
 * Lays segments over songs, in order. Hills and intervals take exactly one song; a flat segment takes
 * `songs` (default 1). Boundaries land on song boundaries. Never guesses a missing song length.
 */
export interface FitOptions {
  /** A cool-down ends this many seconds after its song starts (the song keeps playing under the stretches). */
  cooldownSec?: number;
}

export function fitSegmentsToSongs(songs: Song[], template: FitTemplate[], opts: FitOptions = {}): FitResult {
  const errors: string[] = [];
  const warnings: Warning[] = [];
  const segments: RideSegment[] = [];
  const tracklist: RideTrack[] = [];
  let next = 0;

  template.forEach((t, segmentIndex) => {
    const count = t.type === "flat" ? Math.max(1, Math.floor(t.songs ?? 1)) : 1;
    const used = songs.slice(next, next + count);
    next += used.length;
    if (used.length < count) {
      errors.push(`"${t.name}" needs ${count} song(s) but only ${used.length} are left.`);
      return;
    }
    const bad = used.filter((s) => !(typeof s.durationSec === "number" && s.durationSec > 0));
    if (bad.length) {
      errors.push(`Add a length for ${bad.map((s) => `${s.artist} - ${s.title}`).join(", ")} (for "${t.name}").`);
      return;
    }
    const sec = used.reduce((a, s) => a + (s.durationSec as number), 0);
    used.forEach((s) => tracklist.push({ segmentIndex, title: s.title, artist: s.artist, durationSec: s.durationSec, ...(s.durationSource ? { durationSource: s.durationSource } : {}) }));

    if (t.type === "flat") {
      const { songs: _n, ...rest } = t;
      const cool = t.role === "cooldown" && opts.cooldownSec !== undefined;
      if (cool && sec < (opts.cooldownSec as number)) {
        warnings.push({ code: "songs-vs-segments", segmentIndex, message: `"${t.name}": the song is shorter than the ${fmtSec(opts.cooldownSec as number)} cool-down.` });
      }
      segments.push({ ...rest, durationSec: cool ? Math.min(sec, opts.cooldownSec as number) : sec });
    } else if (t.type === "hill") {
      segments.push({ ...t, durationSec: sec });
    } else {
      const cycle = t.workSec + t.restSec;
      let rounds = Math.max(1, Math.round(sec / cycle));
      let adj = sec - rounds * cycle;
      if (t.restSec + adj < MIN_FINAL_REST_SEC && rounds > 1) {
        rounds -= 1;
        adj = sec - rounds * cycle;
      }
      if (t.restSec + adj < MIN_FINAL_REST_SEC) {
        warnings.push({ code: "final-rest-short", segmentIndex, message: `"${t.name}": the song is too short for a ${MIN_FINAL_REST_SEC}s final rest.` });
      }
      segments.push({ ...t, rounds, ...(adj !== 0 ? { finalRestAdjustSec: adj } : {}) });
    }
  });

  return { ok: errors.length === 0, segments, tracklist, unused: songs.slice(next), errors, warnings };
}

const fmtSec = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

/** Parses pasted lines like "Artist - Title - 4:17" (or "Artist, Title, 4:17"). Bad lines are reported, not guessed. */
export function parseTracklist(text: string): { songs: Song[]; bad: string[] } {
  const songs: Song[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*(?:\s-\s|\t|,)\s*(.+?)\s*(?:\s-\s|\t|,)\s*(\d{1,3}):([0-5]\d)\s*$/);
    if (!m) { bad.push(line); continue; }
    songs.push({ artist: m[1].trim(), title: m[2].trim(), durationSec: Number(m[3]) * 60 + Number(m[4]), durationSource: "manual" });
  }
  return { songs, bad };
}
