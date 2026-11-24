/**
 * "Must include": songs the admin types that have to be on the playlist. Pure logic, no network.
 * The AI is asked to place them where they fit the energy arc, but the app does not trust that: ensureMusts() checks the result and
 * adds any that are missing, so a typed song can never silently fail to appear.
 */
import { artistMatches, baseTitle, dense } from "./songs/match";

export interface MustSong { artist: string; title: string }

/** At most this many must-include songs in one playlist. */
export const MAX_MUST = 8;

export interface ParsedMust { songs: MustSong[]; bad: string[] }

const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * One song per line (a semicolon also separates). "Artist - Song" (a hyphen or a dash) or "Song by Artist".
 * Lines that are neither come back in `bad`, so the screen can say which ones to fix.
 */
export function parseMust(text: string): ParsedMust {
  const songs: MustSong[] = [];
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\n;]/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    let artist = "", title = "";
    const dash = line.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    const by = line.match(/^(.+?)\s+by\s+(.+)$/i);
    if (dash) { artist = clean(dash[1]); title = clean(dash[2]); }
    else if (by) { title = clean(by[1]); artist = clean(by[2]); }
    if (!artist || !title) { bad.push(line); continue; }
    const key = dense(`${artist} ${baseTitle(title)}`);
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push({ artist, title });
  }
  if (songs.length > MAX_MUST) { bad.push(...songs.slice(MAX_MUST).map((s) => `${s.artist} - ${s.title} (more than ${MAX_MUST} songs)`)); songs.length = MAX_MUST; }
  return { songs, bad };
}

/** A song as the planner returns it (the parts this needs). */
export interface PlanSong { title: string; artist: string; intensity: number; spare?: boolean; must?: boolean }

export const sameSong = (a: MustSong, b: MustSong) => artistMatches(a.artist, b.artist) && dense(baseTitle(a.title)) === dense(baseTitle(b.title));

export interface EnsureResult<T extends PlanSong> { songs: T[]; found: MustSong[]; added: MustSong[] }

/**
 * Makes sure every must-include song is in the planned list. A song the planner already returned (even with "(Remastered)" or a
 * differently cased name) is kept where the planner put it and marked `must`, never a spare. A song it left out is added in the
 * middle, spread evenly if several, never as the warm-up or cool-down slot. Typed spelling replaces the planner's, so the catalog
 * lookup uses what the admin wrote.
 */
export function ensureMusts<T extends PlanSong>(planned: T[], musts: MustSong[]): EnsureResult<T> {
  const songs = planned.map((s) => ({ ...s }));
  const found: MustSong[] = [], missing: MustSong[] = [];
  for (const m of musts) {
    const i = songs.findIndex((s) => !s.must && sameSong(s, m));
    if (i >= 0) {
      const { spare: _spare, ...rest } = songs[i];
      void _spare;
      songs[i] = { ...rest, title: m.title, artist: m.artist, must: true } as T;
      found.push(m);
    } else missing.push(m);
  }
  const added: MustSong[] = [];
  missing.forEach((m, k) => {
    const n = songs.length;
    // Between the first and last song, spread across the middle.
    const at = n < 3 ? n : Math.max(1, Math.min(n - 1, Math.round(1 + ((n - 2) * (k + 1)) / (missing.length + 1))));
    songs.splice(at, 0, { title: m.title, artist: m.artist, intensity: 5, must: true } as unknown as T);
    added.push(m);
  });
  return { songs, found, added };
}

/** The plain-English line for the screen after planning. */
export function mustNote(r: { found: MustSong[]; added: MustSong[] }): string {
  const names = (l: MustSong[]) => l.map((s) => `${s.title}`).join(", ");
  const all = r.found.length + r.added.length;
  if (!all) return "";
  return r.added.length
    ? `Your ${all === 1 ? "song is" : `${all} songs are`} on the list. Added: ${names(r.added)}.`
    : `Your ${all === 1 ? "song is" : `${all} songs are`} on the list.`;
}
