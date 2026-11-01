import type { Track, Workout } from "./types";

export const GENRES = ["Rock", "Pop", "Hip-hop", "Electronic", "Country", "R&B", "80s"] as const;
export const VIBES = ["Classic", "High energy", "Recent"] as const;
export const DEFAULT_SONG_SEC = 210;

export const songSec = (t: Track) => t.approxDurationSec ?? DEFAULT_SONG_SEC;
export const playlistSeconds = (tracks: Track[]) => tracks.reduce((n, t) => n + songSec(t), 0);

export const amazonSearchUrl = (t: Pick<Track, "title" | "artist">) =>
  `https://music.amazon.com/search/${encodeURIComponent(`${t.artist} ${t.title}`)}`;

/** "Artist - Title", one per line. This is what gets pasted into the Claude in Chrome chat. */
export const toText = (tracks: Track[]) => tracks.map((t) => `${t.artist} - ${t.title}`).join("\n");

const csvCell = (v: string | number | undefined) => {
  const s = v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(w: Workout, tracks: Track[]): string {
  const rows = tracks.map((t) =>
    [t.segmentIndex + 1, w.segments[t.segmentIndex]?.name, t.title, t.artist, t.approxBpm, songSec(t)].map(csvCell).join(","),
  );
  return ["segment,segment_name,title,artist,approx_bpm,approx_seconds", ...rows].join("\n");
}

/** When each track starts, assuming songs in a segment play back to back from the segment's start. */
export function trackTimeline(w: Workout): { track: Track; startSec: number }[] {
  const out: { track: Track; startSec: number }[] = [];
  let segStart = 0;
  w.segments.forEach((seg, i) => {
    let offset = 0;
    for (const t of (w.tracklist ?? []).filter((x) => x.segmentIndex === i)) {
      out.push({ track: t, startSec: segStart + offset });
      offset += songSec(t);
    }
    segStart += seg.durationSec;
  });
  return out;
}

/** Visual guide only. RideDeck never plays or controls music. */
export function trackAt(w: Workout, elapsedSec: number): { now?: Track; next?: Track } {
  const tl = trackTimeline(w);
  let idx = -1;
  tl.forEach((e, i) => { if (e.startSec <= elapsedSec) idx = i; });
  return { now: tl[idx]?.track, next: tl[idx + 1]?.track };
}

/** Kept tracks stay; fresh ones fill in. Stable by segment, so locked songs lead their segment. */
export function mergeTracks<T extends Track>(keep: T[], fresh: T[]): T[] {
  return [...keep, ...fresh]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.segmentIndex - b.t.segmentIndex || a.i - b.i)
    .map((x) => x.t);
}
