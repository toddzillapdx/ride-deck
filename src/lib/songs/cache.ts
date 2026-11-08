import type { Candidate } from "./match";

/** Server-side only. The Songs table in Airtable caches one row per song, so each song is looked up once. */
const API = "https://api.airtable.com/v0";
const TABLE = process.env.AIRTABLE_SONGS_TABLE || "Songs";

export interface CachedSong {
  key: string; artist: string; title: string; durationSec: number;
  /** "deezer" (catalog) or "typed" (the rider's own number). */
  source: "deezer" | "typed";
  album?: string; deezerId?: string; isrc?: string; confirmed: boolean;
}

interface Rec { id: string; fields: Record<string, unknown> }

function cfg() {
  const token = process.env.AIRTABLE_TOKEN, base = process.env.AIRTABLE_BASE_ID;
  if (!token || !base) return null;
  return { token, base };
}

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const c = cfg();
  if (!c) throw new Error("Airtable is not configured");
  const res = await fetch(`${API}/${c.base}/${encodeURIComponent(TABLE)}${path}`, {
    ...init, cache: "no-store",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res.json();
}

const fromRec = (r: Rec): CachedSong | null => {
  const f = r.fields;
  if (typeof f.Key !== "string" || typeof f.DurationSec !== "number" || f.DurationSec <= 0) return null;
  return {
    key: f.Key, artist: String(f.Artist ?? ""), title: String(f.Title ?? ""), durationSec: Math.round(f.DurationSec),
    source: f.Source === "typed" ? "typed" : "deezer",
    ...(f.Album ? { album: String(f.Album) } : {}), ...(f.DeezerId ? { deezerId: String(f.DeezerId) } : {}), ...(f.Isrc ? { isrc: String(f.Isrc) } : {}),
    confirmed: f.Confirmed === true,
  };
};

/** Cached rows for these keys. A cache failure is never fatal: the caller just looks the songs up again. */
export async function readCache(keys: string[]): Promise<Map<string, CachedSong>> {
  const out = new Map<string, CachedSong>();
  if (!cfg() || !keys.length) return out;
  try {
    const esc = (k: string) => k.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    for (let i = 0; i < keys.length; i += 20) {
      const part = keys.slice(i, i + 20);
      const formula = `OR(${part.map((k) => `{Key}="${esc(k)}"`).join(",")})`;
      const body = await call(`?${new URLSearchParams({ filterByFormula: formula, pageSize: "100" })}`);
      for (const r of (body.records ?? []) as Rec[]) { const s = fromRec(r); if (s) out.set(s.key, s); }
    }
  } catch { /* cache unavailable */ }
  return out;
}

const fieldsOf = (s: CachedSong) => ({
  Key: s.key, Artist: s.artist, Title: s.title, DurationSec: s.durationSec, Source: s.source,
  Album: s.album ?? "", DeezerId: s.deezerId ?? "", Isrc: s.isrc ?? "", Confirmed: s.confirmed, FetchedAt: new Date().toISOString(),
});

/** Insert or update one song by key. Best effort. */
export async function writeCache(s: CachedSong): Promise<boolean> {
  if (!cfg()) return false;
  try {
    const found = await call(`?${new URLSearchParams({ filterByFormula: `{Key}="${s.key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`, maxRecords: "1" })}`);
    const existing = (found.records ?? [])[0] as Rec | undefined;
    if (existing) await call(`/${existing.id}`, { method: "PATCH", body: JSON.stringify({ fields: fieldsOf(s), typecast: true }) });
    else await call("", { method: "POST", body: JSON.stringify({ fields: fieldsOf(s), typecast: true }) });
    return true;
  } catch { return false; }
}

export const toCached = (key: string, c: Candidate, confirmed: boolean): CachedSong => ({
  key, artist: c.artist, title: c.title, durationSec: c.durationSec, source: "deezer", album: c.album, deezerId: c.id, ...(c.isrc ? { isrc: c.isrc } : {}), confirmed,
});
