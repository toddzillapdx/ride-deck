import { parseWorkout } from "./validate";
import { parseLogInput, type LogInput, type LogPatch, type RideLog } from "./history";
import { totalSeconds } from "./presets";
import { parseRideV2, readRide, rideDuration, rideToLegacyWorkout, type Ride } from "./engine";
import type { Workout } from "./types";

/** Server-side only. The token never reaches the browser. */
const API = "https://api.airtable.com/v0";
/** Preview deploys point TABLE at RidesV2 and LEGACY at the original Rides table, which is read-only. */
const TABLE = process.env.AIRTABLE_RIDES_TABLE || "Rides";
const LEGACY = process.env.AIRTABLE_LEGACY_RIDES_TABLE || "";
const hasLegacy = () => Boolean(LEGACY) && LEGACY !== TABLE;
/** App settings live in one reserved row of the Rides table, so no extra table or token scope is needed. */
export const SETTINGS_NAME = "__settings__";

export class AirtableNotConfigured extends Error {}

function cfg() {
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!token || !base) throw new AirtableNotConfigured("AIRTABLE_TOKEN and AIRTABLE_BASE_ID are not set");
  return { token, base };
}

export const airtableConfigured = () => Boolean(process.env.AIRTABLE_TOKEN && process.env.AIRTABLE_BASE_ID);

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const { token, base } = cfg();
  const res = await fetch(`${API}/${base}/${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtable ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

interface AtRecord { id: string; fields: Record<string, unknown> }

/** Fields written for a workout. WorkoutJson is the source of truth; the rest are for browsing in Airtable. */
export function toFields(w: Workout, now = new Date()) {
  const { id: _id, ...rest } = w;
  return {
    Name: w.name,
    Genre: w.genre ?? "",
    Vibe: w.vibe ?? "",
    PlaylistUrl: w.playlistUrl ?? null,
    TotalSeconds: totalSeconds(w),
    WorkoutJson: JSON.stringify(rest),
    UpdatedAt: now.toISOString(),
  };
}

export function fromRecord(r: AtRecord): Workout {
  const raw = r.fields.WorkoutJson;
  if (typeof raw !== "string") throw new Error(`Record ${r.id} has no WorkoutJson`);
  const json = JSON.parse(raw) as Record<string, unknown>;
  let w: Workout;
  if (json.schemaVersion === 2) {
    // A v2 ride, shown to the (v1-shaped) library, builder and music planner through the interim adapter.
    // Riding reads the raw JSON instead, so nothing is lost; saving it back through the old builder is refused (see isV2).
    const v2 = readRide(json).ride;
    w = parseWorkout({
      ...rideToLegacyWorkout(v2),
      genre: v2.genre, vibe: v2.vibe, eras: v2.eras, genres: v2.genres, seeds: v2.seeds, artistOnly: v2.artistOnly, playlistUrl: v2.playlistUrl,
      tracklist: v2.tracklist,
    });
  } else w = parseWorkout(json);
  // Name and PlaylistUrl can be edited directly in Airtable; those edits win.
  if (typeof r.fields.Name === "string" && r.fields.Name.trim()) w.name = r.fields.Name.trim();
  if (typeof r.fields.PlaylistUrl === "string") w.playlistUrl = r.fields.PlaylistUrl || undefined;
  w.id = r.id;
  return w;
}

/** True when the stored record is a v2 ride. The old (v1) builder must not overwrite it. */
export async function isV2(id: string): Promise<boolean> {
  return (await getRideRaw(id)).schemaVersion === 2;
}

export async function listRides(): Promise<{ rides: Workout[]; skipped: string[] }> {
  const rides: Workout[] = [];
  const skipped: string[] = [];
  const replaced = new Set<string>(); // legacy ids that already have a converted copy in the main table
  for (const table of hasLegacy() ? [TABLE, LEGACY] : [TABLE]) {
    let offset: string | undefined;
    do {
      const q = new URLSearchParams({ pageSize: "100", "sort[0][field]": "UpdatedAt", "sort[0][direction]": "desc" });
      if (offset) q.set("offset", offset);
      const page = await call(`${table}?${q}`);
      for (const r of page.records as AtRecord[]) {
        if (r.fields.Name === SETTINGS_NAME) continue; // app settings, not a ride
        try {
          // A converted copy names the original it replaces (sourceId). The original may be in another table (preview) or in this one (production).
          try { const s = JSON.parse(String(r.fields.WorkoutJson ?? "{}")).sourceId; if (typeof s === "string") replaced.add(s); } catch { /* ignore */ }
          rides.push(fromRecord(r));
        } catch { skipped.push(r.id); }
      }
      offset = page.offset;
    } while (offset);
  }
  return { rides: rides.filter((r) => !replaced.has(r.id)), skipped };
}

/** The record, from the main table or (read-only) the legacy one. `legacy` says which. */
async function findRecord(id: string): Promise<AtRecord & { legacy?: boolean }> {
  try {
    return await call(`${TABLE}/${encodeURIComponent(id)}`);
  } catch (e) {
    if (hasLegacy() && /Airtable (404|422)/.test((e as Error).message)) return { ...(await call(`${LEGACY}/${encodeURIComponent(id)}`)), legacy: true };
    throw e;
  }
}

export async function getRide(id: string): Promise<Workout> {
  return fromRecord(await findRecord(id));
}

/** The stored ride JSON as-is (v1 or v2), with the id and the Airtable-editable fields applied. The client converts v1. */
export async function getRideRaw(id: string): Promise<Record<string, unknown>> {
  const r = await findRecord(id);
  const raw = r.fields.WorkoutJson;
  if (typeof raw !== "string") throw new Error(`Record ${r.id} has no WorkoutJson`);
  const o = JSON.parse(raw) as Record<string, unknown>;
  if (typeof r.fields.Name === "string" && r.fields.Name.trim()) o.name = r.fields.Name.trim();
  if (typeof r.fields.PlaylistUrl === "string") o.playlistUrl = r.fields.PlaylistUrl || undefined;
  o.id = r.id;
  // Tell the builder this one is read-only (a save has to make a converted copy instead).
  if (r.legacy) o.__legacy = true;
  return o;
}

export async function createRide(w: Workout): Promise<Workout> {
  return fromRecord(await call(TABLE, { method: "POST", body: JSON.stringify({ fields: toFields(w) }) }));
}

export async function updateRide(id: string, w: Workout): Promise<Workout> {
  return fromRecord(await call(`${TABLE}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ fields: toFields(w) }) }));
}

export async function deleteRide(id: string): Promise<void> {
  await call(`${TABLE}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Fields written for a v2 ride. WorkoutJson is the source of truth; the rest are for browsing in Airtable. */
export function toFieldsV2(r: Ride, now = new Date()) {
  const { id: _id, ...rest } = r;
  return {
    Name: r.name, Genre: r.genre ?? "", Vibe: r.vibe ?? "", PlaylistUrl: r.playlistUrl ?? null,
    TotalSeconds: rideDuration(r), WorkoutJson: JSON.stringify(rest), UpdatedAt: now.toISOString(),
  };
}

export async function createRideV2(r: Ride): Promise<Workout> {
  return fromRecord(await call(TABLE, { method: "POST", body: JSON.stringify({ fields: toFieldsV2(r) }) }));
}

export async function updateRideV2(id: string, r: Ride): Promise<Workout> {
  return fromRecord(await call(`${TABLE}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ fields: toFieldsV2(r) }) }));
}

/** The parts of a ride the music planner edits. Everything else (the segments) is left exactly as stored. */
export interface RideMeta {
  tracklist?: Ride["tracklist"];
  playlistUrl?: string;
  genre?: string; vibe?: string; eras?: string[]; genres?: string[]; seeds?: string; artistOnly?: boolean;
}

/**
 * Saves music-planner changes without touching the segments. A v2 ride is updated in place. A v1 ride is converted
 * first; if it lives in the read-only legacy table the converted copy is created in the main table (with sourceId).
 */
export async function patchRideMeta(id: string, meta: RideMeta): Promise<Workout> {
  const rec = await findRecord(id);
  const raw = JSON.parse(String(rec.fields.WorkoutJson ?? "{}")) as Record<string, unknown>;
  if (typeof rec.fields.Name === "string" && rec.fields.Name.trim()) raw.name = rec.fields.Name.trim();
  const base = readRide({ ...raw, id: rec.id }).ride;
  const next: Ride = parseRideV2({ ...base, ...meta, id: rec.legacy || raw.schemaVersion !== 2 ? "" : rec.id, sourceId: rec.legacy ? rec.id : base.sourceId });
  return rec.legacy ? createRideV2(next) : updateRideV2(id, next);
}

// ---- Ride history (RideLog table) ----
const LOG_TABLE = "RideLog";

export function toLogFields(l: LogInput) {
  return {
    Name: l.rideName,
    RideId: l.rideId,
    StartedAt: l.startedAt,
    ElapsedSeconds: l.elapsedSec,
    PlannedSeconds: l.plannedSec,
    SegmentsCompleted: l.segmentsCompleted,
    SegmentsTotal: l.segmentsTotal,
    ...(l.kcal === undefined ? {} : { Kcal: l.kcal }),
    ...(l.notes ? { Notes: l.notes } : {}),
    ...(l.endedEarly ? { EndedEarly: true } : {}),
    ...(l.rideSec === undefined ? {} : { RideSeconds: l.rideSec }),
    ...(l.stretchSec === undefined ? {} : { StretchSeconds: l.stretchSec }),
    SegmentsJson: JSON.stringify(l.segments),
  };
}

export function fromLogRecord(r: AtRecord): RideLog {
  const f = r.fields;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  let segments: RideLog["segments"] = [];
  try {
    segments = parseLogInput({
      rideName: "x", rideId: "", startedAt: "2000-01-01", elapsedSec: 0, plannedSec: 0, segmentsCompleted: 0,
      segments: JSON.parse(String(f.SegmentsJson ?? "[]")),
    }).segments;
  } catch { /* an unreadable snapshot just means no chart */ }
  return {
    id: r.id,
    rideId: typeof f.RideId === "string" ? f.RideId : "",
    rideName: typeof f.Name === "string" ? f.Name : "Ride",
    startedAt: typeof f.StartedAt === "string" ? f.StartedAt : new Date(0).toISOString(),
    elapsedSec: num(f.ElapsedSeconds),
    plannedSec: num(f.PlannedSeconds),
    segmentsCompleted: num(f.SegmentsCompleted),
    segmentsTotal: num(f.SegmentsTotal) || segments.length,
    ...(typeof f.Kcal === "number" ? { kcal: f.Kcal } : {}),
    ...(typeof f.Notes === "string" && f.Notes ? { notes: f.Notes } : {}),
    ...(f.EndedEarly === true ? { endedEarly: true } : {}),
    ...(typeof f.RideSeconds === "number" ? { rideSec: f.RideSeconds } : {}),
    ...(typeof f.StretchSeconds === "number" ? { stretchSec: f.StretchSeconds } : {}),
    segments,
  };
}

export async function listLogs(): Promise<RideLog[]> {
  const logs: RideLog[] = [];
  let offset: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: "100", "sort[0][field]": "StartedAt", "sort[0][direction]": "desc" });
    if (offset) q.set("offset", offset);
    const page = await call(`${LOG_TABLE}?${q}`);
    for (const r of page.records as AtRecord[]) logs.push(fromLogRecord(r));
    offset = page.offset;
  } while (offset);
  return logs;
}

export async function createLog(l: LogInput): Promise<RideLog> {
  return fromLogRecord(await call(LOG_TABLE, { method: "POST", body: JSON.stringify({ fields: toLogFields(l) }) }));
}

export async function updateLog(id: string, patch: LogPatch): Promise<RideLog> {
  const fields: Record<string, unknown> = {};
  if ("kcal" in patch) fields.Kcal = patch.kcal; // null clears the cell
  if ("notes" in patch) fields.Notes = patch.notes ?? "";
  if (patch.elapsedSec !== undefined) fields.ElapsedSeconds = patch.elapsedSec;
  if (patch.stretchSec !== undefined) fields.StretchSeconds = patch.stretchSec;
  return fromLogRecord(await call(`${LOG_TABLE}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ fields }) }));
}

export async function deleteLog(id: string): Promise<void> {
  await call(`${LOG_TABLE}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---- App settings (shared across devices)
export interface AppSettings {
  /** Built-in starter rides the user has removed. They stay resolvable by id, so old history still works. */
  hiddenPresets: string[];
}

async function settingsRecord(table = TABLE): Promise<AtRecord | undefined> {
  const q = new URLSearchParams({ filterByFormula: `{Name}="${SETTINGS_NAME}"`, maxRecords: "1" });
  const page = await call(`${table}?${q}`);
  return (page.records as AtRecord[])[0];
}

export async function getSettings(): Promise<AppSettings> {
  // A preview with no settings row of its own starts from the original (read-only) one.
  const rec = (await settingsRecord()) ?? (hasLegacy() ? await settingsRecord(LEGACY) : undefined);
  try {
    const o = JSON.parse(String(rec?.fields.WorkoutJson ?? "{}"));
    return { hiddenPresets: Array.isArray(o.hiddenPresets) ? o.hiddenPresets.filter((x: unknown): x is string => typeof x === "string") : [] };
  } catch {
    return { hiddenPresets: [] };
  }
}

export async function putSettings(s: AppSettings): Promise<AppSettings> {
  const fields = { Name: SETTINGS_NAME, WorkoutJson: JSON.stringify(s), UpdatedAt: new Date().toISOString() };
  const rec = await settingsRecord();
  if (rec) await call(`${TABLE}/${encodeURIComponent(rec.id)}`, { method: "PATCH", body: JSON.stringify({ fields }) });
  else await call(TABLE, { method: "POST", body: JSON.stringify({ fields }) });
  return s;
}
