import type { Track, Workout } from "./types";

export const ERAS = ["70s", "80s", "90s", "2000s", "2010s", "Now"] as const;
export const GENRES = ["Rock", "Pop", "Hip-hop / Rap", "Grunge / Alt", "Punk", "Metal", "Electronic", "Country", "R&B"] as const;
export const VIBES = ["Classic", "High energy", "Recent"] as const;
export const DEFAULT_SONG_SEC = 210;

export const songSec = (t: Track) => t.durationSec ?? t.approxDurationSec ?? DEFAULT_SONG_SEC;
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
    [t.segmentIndex + 1, w.segments[t.segmentIndex]?.name, t.title, t.artist, t.approxBpm, songSec(t), t.genre, t.era].map(csvCell).join(","),
  );
  return ["segment,segment_name,title,artist,approx_bpm,approx_seconds,genre,era", ...rows].join("\n");
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
    `- the list of songs you added, in order, one per line as: Artist - Title - m:ss (the length shown in Amazon Music, e.g. 4:17). Please read the real length from Amazon Music; do not guess it.`,
    `- the songs you skipped and why`,
  ].join("\n");
}

/** The style the planner works from. Empty eras or genres means "any". */
export interface Style {
  eras: string[];
  genres: string[];
  vibe: string;
  seeds: string;
  /** Only the artist(s) named in `seeds`. Era and genre are then ignored. */
  artistOnly: boolean;
}

const GENRE_ALIASES: Record<string, string> = { "hip-hop": "Hip-hop / Rap", "hip hop": "Hip-hop / Rap", hiphop: "Hip-hop / Rap", rap: "Hip-hop / Rap", grunge: "Grunge / Alt", alt: "Grunge / Alt", alternative: "Grunge / Alt", dance: "Electronic", edm: "Electronic" };

/** Rides saved before the style picks existed have a single genre string ("Rock", "80s"). Map it onto the chips. */
export function styleFromWorkout(w: Pick<Workout, "genre" | "vibe" | "eras" | "genres" | "seeds" | "artistOnly">): Style {
  const vibe = (VIBES as readonly string[]).includes(w.vibe ?? "") ? (w.vibe as string) : "Classic";
  if (w.eras || w.genres || w.seeds) return { eras: w.eras ?? [], genres: w.genres ?? [], seeds: w.seeds ?? "", vibe, artistOnly: w.artistOnly === true && !!(w.seeds ?? "").trim() };
  const g = (w.genre ?? "").trim();
  const era = ERAS.find((e) => e.toLowerCase() === g.toLowerCase());
  const genre = GENRES.find((x) => x.toLowerCase() === g.toLowerCase()) ?? GENRE_ALIASES[g.toLowerCase()];
  return { eras: era ? [era] : [], genres: genre ? [genre] : [], seeds: "", vibe, artistOnly: false };
}

/** Short label, e.g. "90s + 2000s · Rock + Hip-hop / Rap". */
export function styleSummary(s: Pick<Style, "eras" | "genres"> & Partial<Pick<Style, "artistOnly" | "seeds">>): string {
  if (s.artistOnly && s.seeds?.trim()) return `Artist only: ${s.seeds.trim().slice(0, 40)}`;
  return [s.eras.length ? s.eras.join(" + ") : "Any era", s.genres.length ? s.genres.join(" + ") : "Any genre"].join(" · ");
}

/** What goes in the saved ride's Genre field: just the picks, comma separated. */
export const styleForSave = (s: Pick<Style, "eras" | "genres"> & Partial<Pick<Style, "artistOnly" | "seeds">>) =>
  s.artistOnly && s.seeds?.trim() ? `Artist only: ${s.seeds.trim().slice(0, 40)}` : [...s.eras, ...s.genres].join(", ");

/** How many songs landed under each chosen era and genre, so you can see the spread is even. */
export function spreadCounts(tracks: Track[], s: Pick<Style, "eras" | "genres">): { genres: [string, number][]; eras: [string, number][] } {
  const count = (labels: string[], pick: (t: Track) => string | undefined): [string, number][] =>
    labels.map((l) => [l, tracks.filter((t) => pick(t)?.toLowerCase() === l.toLowerCase()).length]);
  return { genres: count(s.genres, (t) => t.genre), eras: count(s.eras, (t) => t.era) };
}
