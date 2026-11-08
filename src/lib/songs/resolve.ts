import { searchDeezer } from "./deezer";
import { readCache, toCached, writeCache, type CachedSong } from "./cache";
import { chooseMatch, songKey, type Candidate, type MatchStatus, type SongQuery } from "./match";

/** One song, resolved to a real length (or flagged). */
export interface Resolved {
  artist: string; title: string; key: string;
  status: MatchStatus | "cached";
  durationSec?: number;
  source?: "deezer" | "typed";
  album?: string;
  reason?: string;
  /** For a doubtful match: the versions to choose from. */
  candidates?: Candidate[];
}

const MAX_SONGS = 40;

export async function resolveSongs(queries: SongQuery[], search: (q: SongQuery) => Promise<Candidate[]> = searchDeezer): Promise<Resolved[]> {
  const list = queries.slice(0, MAX_SONGS);
  const keys = list.map(songKey);
  const cache = await readCache([...new Set(keys)]);
  const out: Resolved[] = new Array(list.length);
  const todo: number[] = [];
  list.forEach((q, i) => {
    const hit = cache.get(keys[i]);
    if (hit) out[i] = { artist: q.artist, title: q.title, key: keys[i], status: "cached", durationSec: hit.durationSec, source: hit.source, album: hit.album };
    else todo.push(i);
  });
  // Three at a time keeps well under Deezer's rate limit.
  for (let at = 0; at < todo.length; at += 3) {
    await Promise.all(todo.slice(at, at + 3).map(async (i) => {
      const q = list[i];
      try {
        const m = chooseMatch(q, await search(q));
        if (m.status === "ok" && m.chosen) {
          out[i] = { artist: q.artist, title: q.title, key: keys[i], status: "ok", durationSec: m.chosen.durationSec, source: "deezer", album: m.chosen.album, candidates: m.candidates };
          await writeCache(toCached(keys[i], m.chosen, false));
        } else {
          out[i] = { artist: q.artist, title: q.title, key: keys[i], status: m.status, reason: m.reason, candidates: m.candidates, ...(m.chosen ? { durationSec: m.chosen.durationSec, album: m.chosen.album, source: "deezer" as const } : {}) };
        }
      } catch (e) {
        out[i] = { artist: q.artist, title: q.title, key: keys[i], status: "missing", reason: (e as Error).message };
      }
    }));
  }
  return out;
}

/** The rider picked a version (or typed a length). Remember it so the song is never asked about again. */
export async function rememberSong(q: SongQuery, pick: { durationSec: number; candidate?: Candidate }): Promise<boolean> {
  const key = songKey(q);
  const song: CachedSong = pick.candidate
    ? toCached(key, pick.candidate, true)
    : { key, artist: q.artist, title: q.title, durationSec: Math.round(pick.durationSec), source: "typed", confirmed: true };
  return writeCache(song);
}
