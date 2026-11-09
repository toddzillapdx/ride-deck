/** Pure song matching. Decides which catalog entry is "the" recording and when to ask the rider. No network here. */

export interface Candidate {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  /** Catalog popularity. Higher means more played. */
  rank: number;
  isrc?: string;
}

export interface SongQuery { artist: string; title: string }

export type MatchStatus = "ok" | "doubtful" | "missing";

export interface Match {
  status: MatchStatus;
  chosen?: Candidate;
  /** Acceptable versions, most played first, so the rider can pick when the match is doubtful. */
  candidates: Candidate[];
  reason?: string;
}

/** Two versions whose lengths differ by more than this are really different cuts (drift of a few seconds is fine). */
export const DOUBT_SEC = 25;
/** Versions within this many seconds are the same recording listed on different releases. */
export const CLUSTER_SEC = 5;
/** A rival cut only makes a match doubtful if its releases are at least this popular, together, compared with the best cut's. */
export const RIVAL_WEIGHT = 0.5;

export const dense = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");

/** The title without version noise: "(Remastered 2001)", "[Live]", "- 2011 Remaster", "feat. X". */
export function baseTitle(title: string): string {
  return title
    .replace(/\s*[([].*?[)\]]/g, "")
    .replace(/\s+-\s+(?:\d{4}\s+)?(?:remaster|remastered|mono|stereo|single|album|original|digitally|\d{4}).*$/i, "")
    .replace(/\s+(?:feat\.?|ft\.?|featuring|with)\s+.*$/i, "")
    .trim();
}

/** Stable cache key for a song. */
export const songKey = (q: SongQuery) => `${dense(q.artist)}|${dense(baseTitle(q.title))}`;

export function artistMatches(candidate: string, wanted: string): boolean {
  const a = dense(candidate), b = dense(wanted);
  return !!a && !!b && (a === b || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))));
}

const BAD_WORDS = ["demo", "instrumental", "karaoke", "tribute", "cover", "remix", "extended", "megamix", "mashup", "acoustic", "medley", "ringtone", "lullaby", "nightcore", "reverb", "workout", "version"];
/** A mix is fine when it is the year's or the era's own mix ("2009 Mix", "Stereo Mix", "Single Mix"); club and dance mixes are not. */
const BAD_MIX = /\b(?:club|dub|disco|dance|special|extended|12"?|maxi|party|radio|house|vocal|instrumental|acapella|a cappella|bonus)\s+mix\b/i;
const BAD_PHRASES = [BAD_MIX, /made famous/i, /originally performed/i, /in the style of/i, /8-?bit/i, /sped up/i, /slowed/i, /a cappella/i, /\bcappella\b/i];

/** Version words that make a result the wrong recording, unless the wanted title itself uses them. */
export function badVersion(c: Pick<Candidate, "title" | "album">, wanted: string): boolean {
  const own = wanted.toLowerCase();
  const title = c.title.toLowerCase();
  const album = c.album.toLowerCase();
  const word = (w: string) => new RegExp(`\\b${w}\\b`).test(title) && !new RegExp(`\\b${w}\\b`).test(own);
  if (BAD_WORDS.some((w) => (w === "version" ? /\b(?:instrumental|karaoke|acoustic|live|demo|radio|piano|string|orchestral|cover) version\b/.test(title) && !/\bversion\b/.test(own) : word(w)))) return true;
  if (BAD_PHRASES.some((p) => p.test(title) || p.test(album))) return true;
  if (/\blive\b/.test(title) && !/\blive\b/.test(own)) return true;
  if (/\(live\)|\blive (?:at|in|from|on)\b/.test(album) && !/\blive\b/.test(own)) return true;
  if (/\b(?:karaoke|tribute|instrumentals|8-bit)\b/.test(album)) return true;
  if (/\bremix(?:es)?\b/.test(album) && !/\bremix\b/.test(own)) return true;
  return false;
}

/** Pick the recording for a song from catalog search results. */
export function chooseMatch(query: SongQuery, results: Candidate[]): Match {
  const wantedBase = dense(baseTitle(query.title));
  const sameArtist = results.filter((r) => artistMatches(r.artist, query.artist) && r.durationSec > 0);
  const sameSong = sameArtist.filter((r) => dense(baseTitle(r.title)) === wantedBase);
  const good = sameSong.filter((r) => !badVersion(r, query.title)).sort((a, b) => b.rank - a.rank);
  if (!good.length) {
    return {
      status: "missing", candidates: sameSong.sort((a, b) => b.rank - a.rank).slice(0, 5),
      reason: sameSong.length ? "Only live, demo, remix or cover versions turned up." : sameArtist.length ? "No result with that title by that artist." : "No result by that artist.",
    };
  }
  // Same album and length is the same listing twice.
  const seen = new Set<string>();
  const candidates = good.filter((c) => { const k = `${dense(c.album)}|${c.durationSec}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
  // Group releases of the same recording (lengths within a few seconds) and let popularity vote.
  const groups: Candidate[][] = [];
  for (const c of good) {
    const g = groups.find((x) => Math.abs(x[0].durationSec - c.durationSec) <= CLUSTER_SEC);
    if (g) g.push(c); else groups.push([c]);
  }
  const weight = (g: Candidate[]) => g.reduce((t, c) => t + c.rank + 1, 0);
  groups.sort((a, b) => weight(b) - weight(a));
  const chosen = groups[0][0];
  const rival = groups.slice(1).find((g) => Math.abs(g[0].durationSec - chosen.durationSec) > DOUBT_SEC && weight(g) >= weight(groups[0]) * RIVAL_WEIGHT);
  if (rival) {
    return { status: "doubtful", chosen, candidates, reason: `Versions differ: ${fmt(chosen.durationSec)} vs ${fmt(rival[0].durationSec)}.` };
  }
  if (chosen.durationSec < 60 || chosen.durationSec > 900) {
    return { status: "doubtful", chosen, candidates, reason: `Length ${fmt(chosen.durationSec)} looks wrong.` };
  }
  return { status: "ok", chosen, candidates };
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
