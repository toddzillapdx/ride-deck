/** Browser-side calls for the song-first flow. */
import type { SongCandidate, SongDraft } from "./builderV2";

export interface PlannedSongLite { title: string; artist: string; intensity: number; genre?: string; era?: string; reason?: string; approxDurationSec?: number; spare?: boolean }

export interface PlanBody {
  eras: string[]; genres: string[]; vibe: string; seeds: string; artistOnly: boolean; targetMin: number;
  count?: number; spares?: number; avoid: string[]; keep: { artist: string; title: string }[];
  slot?: { index: number; total: number; before?: string; after?: string; wantSec?: number };
}

const PASS_KEY = "ridedeck-passcode";
export const passcode = {
  get: () => { try { return window.localStorage.getItem(PASS_KEY) ?? ""; } catch { return ""; } },
  set: (v: string) => { try { window.localStorage.setItem(PASS_KEY, v); } catch { /* ignore */ } },
};

export class NeedPasscode extends Error {}

/** "You get more on Tuesday." from the time the oldest use in the week frees up. */
export function limitResets(iso?: string): string {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return "More come back over the next week.";
  const day = t.toLocaleDateString(undefined, { weekday: "long" });
  return `You get another ${t.getTime() - Date.now() < 36e5 * 24 ? "later today" : `on ${day}`}.`;
}

export interface QuotaLine { text: string; out: boolean }
/** The little "3 plans left this week" line. Nothing for the owner (no limit) or when accounts are off. */
export function quotaLine(status: { used: number; limit: number; remaining: number | null; resets_at: string | null; exempt: boolean } | undefined | null): QuotaLine | null {
  if (!status || status.exempt || status.remaining === null) return null;
  if (status.remaining <= 0) return { text: `No plans left this week. ${limitResets(status.resets_at ?? undefined)}`, out: true };
  return { text: `${status.remaining} plan${status.remaining === 1 ? "" : "s"} left this week`, out: false };
}

export async function planSongsApi(body: PlanBody): Promise<{ songs: PlannedSongLite[]; notes: string[] }> {
  const res = await fetch("/api/music/songs", { method: "POST", headers: { "Content-Type": "application/json", "x-planner-passcode": passcode.get() }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 && j.code === "signin") throw new Error("Your sign-in ended. Please sign in again.");
  if (res.status === 401) throw new NeedPasscode(passcode.get() ? "That passcode didn't work." : "Enter the planner passcode.");
  if (res.status === 429 && j.code === "limit") throw new Error(`${j.error} ${limitResets(j.resets_at)}`);
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
