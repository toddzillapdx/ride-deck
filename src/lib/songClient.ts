/** Browser-side calls for the song-first flow. */
import type { SongCandidate, SongDraft } from "./builderV2";

export interface PlannedSongLite { title: string; artist: string; intensity: number; genre?: string; era?: string; reason?: string; approxDurationSec?: number }

export interface PlanBody {
  eras: string[]; genres: string[]; vibe: string; seeds: string; artistOnly: boolean; targetMin: number;
  count?: number; avoid: string[]; keep: { artist: string; title: string }[];
  slot?: { index: number; total: number; before?: string; after?: string; wantSec?: number };
}

const PASS_KEY = "ridedeck-passcode";
export const passcode = {
  get: () => { try { return window.localStorage.getItem(PASS_KEY) ?? ""; } catch { return ""; } },
  set: (v: string) => { try { window.localStorage.setItem(PASS_KEY, v); } catch { /* ignore */ } },
};

export class NeedPasscode extends Error {}

export async function planSongsApi(body: PlanBody): Promise<{ songs: PlannedSongLite[]; notes: string[] }> {
  const res = await fetch("/api/music/songs", { method: "POST", headers: { "Content-Type": "application/json", "x-planner-passcode": passcode.get() }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) throw new NeedPasscode(passcode.get() ? "That passcode didn't work." : "Enter the planner passcode.");
  if (!res.ok) throw new Error(j.error ?? `Planning failed (${res.status})`);
  return { songs: j.songs ?? [], notes: j.notes ?? [] };
}

export interface ResolvedApi {
  artist: string; title: string; key: string; status: "ok" | "cached" | "doubtful" | "missing";
  durationSec?: number; source?: "deezer" | "typed"; album?: string; reason?: string; candidates?: SongCandidate[];
}

export async function resolveApi(songs: { artist: string; title: string }[]): Promise<ResolvedApi[]> {
  const res = await fetch("/api/songs/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songs }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `Lookup failed (${res.status})`);
  return j.songs ?? [];
}

export async function rememberApi(song: { artist: string; title: string; durationSec: number; candidate?: SongCandidate }): Promise<void> {
  await fetch("/api/songs/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ remember: song }) }).catch(() => undefined);
}

/** Fold lookup results into the songs (matched by artist + title). Doubtful ones keep their best guess but stay flagged. */
export function applyResolved(songs: SongDraft[], res: ResolvedApi[]): SongDraft[] {
  const k = (a: string, t: string) => `${a.toLowerCase()}|${t.toLowerCase()}`;
  const by = new Map(res.map((r) => [k(r.artist, r.title), r]));
  return songs.map((s) => {
    const r = by.get(k(s.artist, s.title));
    if (!r) return s;
    const base = { ...s, status: r.status, note: r.reason, candidates: r.candidates, ...(r.album ? { album: r.album } : {}) };
    if (r.durationSec !== undefined && r.status !== "missing") return { ...base, durationSec: r.durationSec, durationSource: r.source ?? "deezer" };
    return { ...base, durationSec: undefined, durationSource: undefined };
  });
}
