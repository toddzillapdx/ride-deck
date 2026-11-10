/** Pure mapping from Airtable records to Supabase rows. No network, so it is unit-tested. Never logs ride contents. */

export type Fields = Record<string, unknown>;
export interface AtRec { id: string; fields: Fields }
export type Schema = "preview" | "public";
export const SETTINGS_NAME = "__settings__";

const parse = (v: unknown): unknown => (typeof v === "string" ? JSON.parse(v) : v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const iso = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};

export interface RideOut { id: string; name: string; genre: string | null; vibe: string | null; playlist_url: string | null; total_seconds: number | null; workout: Record<string, unknown>; updated_at: string }
export interface LogOut {
  id: string; ride_id: string | null; name: string | null; started_at: string; elapsed_sec: number | null; planned_sec: number | null;
  segments_completed: number | null; segments_total: number | null; kcal: number | null; notes: string | null; ended_early: boolean;
  ride_seconds: number | null; stretch_seconds: number | null; segments: unknown[];
}
export interface SongOut { key: string; artist: string | null; title: string | null; duration_sec: number; source: "deezer" | "typed"; album: string | null; deezer_id: string | null; isrc: string | null; confirmed: boolean; fetched_at: string }

export type Mapped<T> = { row: T } | { skip: string };

export function mapRide(rec: AtRec, now = new Date()): Mapped<RideOut> {
  const f = rec.fields;
  let workout: unknown;
  try { workout = parse(f.WorkoutJson); } catch { return { skip: "WorkoutJson is not valid JSON" }; }
  if (!workout || typeof workout !== "object" || Array.isArray(workout)) return { skip: "no ride JSON" };
  const { id: _id, ...rest } = workout as Record<string, unknown>;
  const name = str(f.Name) ?? str(rest.name);
  if (!name) return { skip: "no name" };
  return {
    row: {
      id: rec.id, name, genre: str(f.Genre), vibe: str(f.Vibe), playlist_url: str(f.PlaylistUrl), total_seconds: int(f.TotalSeconds),
      workout: rest, updated_at: iso(f.UpdatedAt) ?? iso(f.updatedAt) ?? now.toISOString(),
    },
  };
}

export function mapLog(rec: AtRec): Mapped<LogOut> {
  const f = rec.fields;
  const started = iso(f.StartedAt);
  if (!started) return { skip: "no valid StartedAt" };
  let segments: unknown[] = [];
  try { const s = parse(f.SegmentsJson ?? "[]"); if (Array.isArray(s)) segments = s; } catch { /* a bad snapshot just means no chart */ }
  return {
    row: {
      id: rec.id, ride_id: str(f.RideId), name: str(f.Name), started_at: started, elapsed_sec: int(f.ElapsedSeconds), planned_sec: int(f.PlannedSeconds),
      segments_completed: int(f.SegmentsCompleted), segments_total: int(f.SegmentsTotal), kcal: typeof f.Kcal === "number" ? f.Kcal : null,
      notes: str(f.Notes), ended_early: f.EndedEarly === true, ride_seconds: int(f.RideSeconds), stretch_seconds: int(f.StretchSeconds), segments,
    },
  };
}

export function mapSong(rec: AtRec, now = new Date()): Mapped<SongOut> {
  const f = rec.fields;
  const key = str(f.Key), dur = int(f.DurationSec);
  if (!key) return { skip: "no Key" };
  if (!dur || dur <= 0) return { skip: "no DurationSec" };
  return {
    row: {
      key, artist: str(f.Artist), title: str(f.Title), duration_sec: dur, source: f.Source === "typed" ? "typed" : "deezer",
      album: str(f.Album), deezer_id: str(f.DeezerId), isrc: str(f.Isrc), confirmed: f.Confirmed === true, fetched_at: iso(f.FetchedAt) ?? now.toISOString(),
    },
  };
}

/** The settings row's value ({ hiddenPresets: [...] }), or null if there is none or it is unreadable. */
export function mapSettings(rec: AtRec | undefined): { hiddenPresets: string[] } | null {
  if (!rec) return null;
  try {
    const o = parse(rec.fields.WorkoutJson) as { hiddenPresets?: unknown } | null;
    return { hiddenPresets: Array.isArray(o?.hiddenPresets) ? o!.hiddenPresets.filter((x: unknown): x is string => typeof x === "string") : [] };
  } catch { return null; }
}

export interface Source { rides: AtRec[]; ridesV2: AtRec[]; logs: AtRec[]; songs: AtRec[] }
export interface Skipped { table: string; id: string; reason: string }
export interface Plan {
  schema: Schema;
  rides: RideOut[]; logs: LogOut[]; songs: SongOut[];
  settings: { hiddenPresets: string[] } | null;
  skipped: Skipped[];
}

/**
 * What goes where.
 * preview: production Rides + RidesV2 + Songs + settings. No history (preview history starts empty and separate).
 * public:  Rides + RideLog + Songs + settings. Not RidesV2 (those are preview test rides).
 */
export function buildPlan(schema: Schema, src: Source, now = new Date()): Plan {
  const skipped: Skipped[] = [];
  const settingsRec = src.rides.find((r) => r.fields.Name === SETTINGS_NAME);
  const take = <T>(table: string, recs: AtRec[], fn: (r: AtRec) => Mapped<T>, keyOf: (t: T) => string): T[] => {
    const out: T[] = [];
    const seen = new Set<string>();
    for (const r of recs) {
      const m = fn(r);
      if ("skip" in m) { skipped.push({ table, id: r.id, reason: m.skip }); continue; }
      const k = keyOf(m.row);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m.row);
    }
    return out;
  };
  const rideRecs = src.rides.filter((r) => r.fields.Name !== SETTINGS_NAME);
  const rides = take("Rides", schema === "preview" ? [...rideRecs, ...src.ridesV2] : rideRecs, (r) => mapRide(r, now), (r) => r.id);
  const logs = schema === "public" ? take("RideLog", src.logs, mapLog, (l) => l.id) : [];
  const songs = take("Songs", src.songs, (r) => mapSong(r, now), (s) => s.key);
  return { schema, rides, logs, songs, settings: mapSettings(settingsRec), skipped };
}

/** Records from a local backup file (flat objects, JSON already parsed) in the same shape as Airtable records. */
export function recsFromBackup(items: unknown): AtRec[] {
  if (!Array.isArray(items)) return [];
  return items.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string").map((o) => {
    const { id, createdTime: _c, ...fields } = o;
    return { id: id as string, fields: fields as Fields };
  });
}
