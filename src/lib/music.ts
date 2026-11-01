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

/**
 * One block to paste into a Claude in Chrome chat: the instructions and the songs together.
 * Amazon Music has no API, so a browser agent builds the playlist from this.
 */
export function toPlaylistPrompt(w: Workout, tracks: Track[], genre?: string, vibe?: string): string {
  const name = `RideDeck: ${w.name}`;
  const list = tracks.map((t, i) => `${i + 1}. ${t.artist} - ${t.title}`).join("\n");
  const style = [genre, vibe].filter(Boolean).join(", ");
  return [
    `Please build a playlist in Amazon Music for me. Use the Amazon Music tab in this browser (music.amazon.com), where I am already signed in.`,
    ``,
    `Playlist name: ${name}`,
    `${tracks.length} songs${style ? ` (${style})` : ""}, about ${Math.round(playlistSeconds(tracks) / 60)} minutes. Keep them in exactly this order, because they are paced to a workout.`,
    ``,
    `Songs:`,
    list,
    ``,
    `How to do it:`,
    `1. Create one new playlist with the name above. Do not change any of my existing playlists.`,
    `2. For each song, search for "Artist Title" and add the original studio recording by that artist. Avoid live versions, remixes, covers and karaoke versions unless there is no other option.`,
    `3. If you can't find a song or aren't sure it's the right one, skip it and keep going. Don't substitute a different song.`,
    `4. Don't buy anything, start a trial or change any account settings. If Amazon asks me to pay or sign in again, stop and tell me.`,
    ``,
    `When you finish, reply with:`,
    `- the playlist link (use Share, then copy the link), on its own line`,
    `- the list of songs you added, in order`,
    `- the songs you skipped and why`,
  ].join("\n");
}
