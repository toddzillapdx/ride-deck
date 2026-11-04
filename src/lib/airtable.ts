import { parseWorkout } from "./validate";
import { parseLogInput, type LogInput, type RideLog } from "./history";
import { totalSeconds } from "./presets";
import type { Workout } from "./types";

/** Server-side only. The token never reaches the browser. */
const API = "https://api.airtable.com/v0";
const TABLE = "Rides";
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
  const w = parseWorkout(JSON.parse(raw));
  // Name and PlaylistUrl can be edited directly in Airtable; those edits win.
  if (typeof r.fields.Name === "string" && r.fields.Name.trim()) w.name = r.fields.Name.trim();
  if (typeof r.fields.PlaylistUrl === "string") w.playlistUrl = r.fields.PlaylistUrl || undefined;
  w.id = r.id;
  return w;
}

export async function listRides(): Promise<{ rides: Workout[]; skipped: string[] }> {
  const rides: Workout[] = [];
  const skipped: string[] = [];
  let offset: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: "100", "sort[0][field]": "UpdatedAt", "sort[0][direction]": "desc" });
    if (offset) q.set("offset", offset);
    const page = await call(`${TABLE}?${q}`);
    for (const r of page.records as AtRecord[]) {
      if (r.fields.Name === SETTINGS_NAME) continue; // app settings, not a ride
      try { rides.push(fromRecord(r)); } catch { skipped.push(r.id); }
    }
    offset = page.offset;
  } while (offset);
  return { rides, skipped };
}

export async function getRide(id: string): Promise<Workout> {
  return fromRecord(await call(`${TABLE}/${encodeURIComponent(id)}`));
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

export async function updateLog(id: string, patch: { kcal?: number | null; notes?: string | null }): Promise<RideLog> {
  const fields: Record<string, unknown> = {};
  if ("kcal" in patch) fields.Kcal = patch.kcal; // null clears the cell
  if ("notes" in patch) fields.Notes = patch.notes ?? "";
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

async function settingsRecord(): Promise<AtRecord | undefined> {
  const q = new URLSearchParams({ filterByFormula: `{Name}="${SETTINGS_NAME}"`, maxRecords: "1" });
  const page = await call(`${TABLE}?${q}`);
  return (page.records as AtRecord[])[0];
}

export async function getSettings(): Promise<AppSettings> {
  const rec = await settingsRecord();
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
