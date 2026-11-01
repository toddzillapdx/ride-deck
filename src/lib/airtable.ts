import { parseWorkout } from "./validate";
import { totalSeconds } from "./presets";
import type { Workout } from "./types";

/** Server-side only. The token never reaches the browser. */
const API = "https://api.airtable.com/v0";
const TABLE = "Rides";

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
