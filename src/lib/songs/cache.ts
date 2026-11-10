import type { SupabaseClient } from "@supabase/supabase-js";
import { db, dbConfigured } from "../db/client";
import type { Candidate } from "./match";

/** Server-side only. The songs table caches one row per song, so each song is looked up once. Best effort: never throws. */
export interface CachedSong {
  key: string; artist: string; title: string; durationSec: number;
  /** "deezer" (catalog) or "typed" (the rider's own number). */
  source: "deezer" | "typed";
  album?: string; deezerId?: string; isrc?: string; confirmed: boolean;
}

interface SongRow {
  key: string; artist?: string | null; title?: string | null; duration_sec?: number | null; source?: string | null;
  album?: string | null; deezer_id?: string | null; isrc?: string | null; confirmed?: boolean | null; fetched_at?: string;
}

export const songToRow = (s: CachedSong, now = new Date()): SongRow => ({
  key: s.key, artist: s.artist, title: s.title, duration_sec: Math.round(s.durationSec), source: s.source,
  album: s.album ?? null, deezer_id: s.deezerId ?? null, isrc: s.isrc ?? null, confirmed: s.confirmed, fetched_at: now.toISOString(),
});

export const rowToSong = (r: SongRow): CachedSong | null => {
  if (typeof r.key !== "string" || typeof r.duration_sec !== "number" || r.duration_sec <= 0) return null;
  return {
    key: r.key, artist: r.artist ?? "", title: r.title ?? "", durationSec: Math.round(r.duration_sec),
    source: r.source === "typed" ? "typed" : "deezer",
    ...(r.album ? { album: r.album } : {}), ...(r.deezer_id ? { deezerId: r.deezer_id } : {}), ...(r.isrc ? { isrc: r.isrc } : {}),
    confirmed: r.confirmed === true,
  };
};

/** Cached rows for these keys, in one query. A cache failure is never fatal: the caller just looks the songs up again. */
export async function readCache(keys: string[], client?: SupabaseClient): Promise<Map<string, CachedSong>> {
  const out = new Map<string, CachedSong>();
  if (!keys.length || (!client && !dbConfigured())) return out;
  try {
    const res = await (client ?? db()).from("songs").select("*").in("key", keys);
    if (res.error) return out;
    for (const r of (res.data ?? []) as SongRow[]) { const s = rowToSong(r); if (s) out.set(s.key, s); }
  } catch { /* cache unavailable */ }
  return out;
}

/** Insert or update one song by key, in one query. Best effort. */
export async function writeCache(s: CachedSong, client?: SupabaseClient): Promise<boolean> {
  if (!client && !dbConfigured()) return false;
  try {
    const res = await (client ?? db()).from("songs").upsert(songToRow(s), { onConflict: "key" });
    return !res.error;
  } catch { return false; }
}

export const toCached = (key: string, c: Candidate, confirmed: boolean): CachedSong => ({
  key, artist: c.artist, title: c.title, durationSec: c.durationSec, source: "deezer", album: c.album, deezerId: c.id, ...(c.isrc ? { isrc: c.isrc } : {}), confirmed,
});
