/**
 * Reads the reply from the playlist-building agent ("Regulate: 4:11 (target 3:46)", "1. Bring the Pain – 3:10 (target 3:08)") and
 * works out each song's real length on the music service. Pure: no network. Names are matched loosely, because the service spells
 * titles its own way ("Nuthin' But A \"G\" Thang"), but a song is only ever matched when most of its title words are on the line.
 */
import { artistMatches, baseTitle, dense } from "./songs/match";

export interface ReportSong { title: string; artist: string }
export interface ReportMatch { index: number; durationSec: number; line: string }
export interface ReportResult {
  matches: ReportMatch[];
  /** Lines that gave a length but matched none of the songs (shown so nothing is silently ignored). */
  unmatched: string[];
}

const STOP = new Set(["a", "an", "the", "of", "and", "feat", "ft", "vs", "with", "to", "in", "on", "for"]);
const TIME = /(?<!\d)(\d{1,2}):([0-5]\d)(?!\d)/g;
/** A length that is the old target or the total, not the song's real length. */
const NOT_ACTUAL = /(target|expected|your|app|catalog|listed|wanted|asked|had)\s*(?:length|time)?\s*:?\s*$/i;
/** Lines that talk about something other than a song's length. */
const SKIP_LINE = /\b(total|removed|swap|swapped|replaced|instead|earlier|the first (?:one )?i added)\b/i;

const words = (s: string): string[] =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/['’`]/g, "").split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** The same word, allowing a letter or two of difference in longer words ("nothing" and "nuthin"). */
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && distance(a, b) <= 2) || (Math.min(a.length, b.length) >= 4 && distance(a, b) <= 1);

/** The share of the song's title words found on the line (0 to 1), and how many. */
function titleScore(song: ReportSong, lineWords: string[]): { score: number; hits: number } {
  const t = words(baseTitle(song.title));
  if (!t.length) return { score: 0, hits: 0 };
  const hits = t.filter((w) => lineWords.some((l) => sameWord(w, l))).length;
  return { score: hits / t.length, hits };
}

/** The first length on the line that is the song's own, as seconds, with where it sits. */
function actualLength(line: string): { sec: number; at: number } | null {
  TIME.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME.exec(line))) {
    if (NOT_ACTUAL.test(line.slice(Math.max(0, m.index - 16), m.index))) continue;
    const sec = Number(m[1]) * 60 + Number(m[2]);
    if (sec >= 20 && sec <= 1800) return { sec, at: m.index };
  }
  return null;
}

export function parseLengthReport(text: string, songs: ReportSong[]): ReportResult {
  const found = new Map<number, ReportMatch>();
  const unmatched: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/https?:\/\/\S+/g, " ").replace(/[*`_]/g, "").replace(/^\s*(?:[-•]|\d+[.)])\s*/, "").trim();
    if (!line || SKIP_LINE.test(line)) continue;
    const len = actualLength(line);
    if (!len) continue;
    // The song's name is the line without the lengths and the bracketed notes ("(target 3:08)").
    const label = line.replace(/\([^)]*\)/g, " ").replace(TIME, " ");
    const lw = words(label);
    let best: { i: number; score: number; hits: number; art: number } | null = null;
    songs.forEach((s, i) => {
      if (found.has(i)) return;
      const { score, hits } = titleScore(s, lw);
      if (score < 0.75) return;
      const art = words(s.artist).some((w) => w.length > 2 && lw.some((l) => sameWord(w, l))) || artistMatches(label, s.artist) ? 1 : 0;
      if (!best || score > best.score || (score === best.score && (hits > best.hits || (hits === best.hits && art > best.art)))) best = { i, score, hits, art };
    });
    const pick = best as { i: number } | null;
    if (pick) found.set(pick.i, { index: pick.i, durationSec: len.sec, line });
    else if (lw.length >= 2 && line.length <= 160) unmatched.push(line);
  }
  return { matches: [...found.values()].sort((a, b) => a.index - b.index), unmatched };
}

/** Lengths that really change something, to the second. */
export const changed = (m: ReportMatch, currentSec: number | undefined) => currentSec === undefined || Math.abs(currentSec - m.durationSec) >= 1;

/** Kept for the dense-name helper used by callers that need to compare titles the same way. */
export const titleKey = (s: ReportSong) => dense(`${s.artist} ${baseTitle(s.title)}`);
