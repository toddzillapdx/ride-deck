import type { SupabaseClient } from "@supabase/supabase-js";
import { parseWorkout } from "../validate";
import { totalSeconds } from "../presets";
import { parseRideV2, readRide, rideDuration, rideToLegacyWorkout, type Ride } from "../engine";
import type { Workout } from "../types";
import { NotFound, db, must } from "./client";

/** One row of the rides table. `workout` is the ride JSON without its id (the ride's saved JSON). */
export interface RideRow {
  id: string;
  name: string;
  genre?: string | null;
  vibe?: string | null;
  playlist_url?: string | null;
  total_seconds?: number | null;
  workout: unknown;
  updated_at?: string;
}

type Client = SupabaseClient;

// ---- pure converters --------------------------------------------------------

/** Columns for a v1 workout. The id is never stored inside the JSON. */
export function workoutToRow(w: Workout, now = new Date()) {
  const { id: _id, ...rest } = w;
  return { name: w.name, genre: w.genre ?? null, vibe: w.vibe ?? null, playlist_url: w.playlistUrl ?? null, total_seconds: totalSeconds(w), workout: rest, updated_at: now.toISOString() };
}

/** Columns for a v2 ride. */
export function rideToRow(r: Ride, now = new Date()) {
  const { id: _id, ...rest } = r;
  return { name: r.name, genre: r.genre ?? null, vibe: r.vibe ?? null, playlist_url: r.playlistUrl ?? null, total_seconds: rideDuration(r), workout: rest, updated_at: now.toISOString() };
}

const asObject = (v: unknown): Record<string, unknown> => {
  const o = typeof v === "string" ? JSON.parse(v) : v;
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("Ride JSON is not an object");
  return o as Record<string, unknown>;
};

/** The stored JSON as-is (v1 or v2), with the editable columns applied and the id set. */
export function rowToRaw(row: RideRow): Record<string, unknown> {
  if (row.workout === null || row.workout === undefined) throw new Error(`Ride ${row.id} has no workout`);
  const o = { ...asObject(row.workout) };
  // The name and playlist link columns can be edited directly in the database; those edits win.
  if (typeof row.name === "string" && row.name.trim()) o.name = row.name.trim();
  if (typeof row.playlist_url === "string") o.playlistUrl = row.playlist_url || undefined;
  o.id = row.id;
  return o;
}

/** A row as the (v1-shaped) library, builder and music planner see it. A v2 ride goes through the interim adapter. */
export function rowToWorkout(row: RideRow): Workout {
  const json = asObject(row.workout);
  let w: Workout;
  if (json.schemaVersion === 2) {
    const v2 = readRide(json).ride;
    w = parseWorkout({
      ...rideToLegacyWorkout(v2),
      genre: v2.genre, vibe: v2.vibe, eras: v2.eras, genres: v2.genres, seeds: v2.seeds, artistOnly: v2.artistOnly, playlistUrl: v2.playlistUrl,
      tracklist: v2.tracklist,
    });
  } else w = parseWorkout(json);
  if (typeof row.name === "string" && row.name.trim()) w.name = row.name.trim();
  if (typeof row.playlist_url === "string") w.playlistUrl = row.playlist_url || undefined;
  w.id = row.id;
  return w;
}

// ---- database functions (each takes an optional client so tests can inject a fake) ----

const PAGE = 1000;

async function findRow(id: string, c: Client): Promise<RideRow> {
  const row = must(await c.from("rides").select("*").eq("id", id).maybeSingle()) as RideRow | null;
  if (!row) throw new NotFound(`Ride ${id} not found`);
  return row;
}

export async function listRides(c: Client = db()): Promise<{ rides: Workout[]; skipped: string[] }> {
  const rows: RideRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = (must(await c.from("rides").select("*").order("updated_at", { ascending: false }).range(from, from + PAGE - 1)) ?? []) as RideRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  const rides: Workout[] = [];
  const skipped: string[] = [];
  const replaced = new Set<string>(); // originals that already have a converted copy
  for (const row of rows) {
    try {
      // A converted copy names the original it replaces (sourceId): the library hides that original.
      const s = (row.workout as { sourceId?: unknown } | null)?.sourceId;
      if (typeof s === "string") replaced.add(s);
      rides.push(rowToWorkout(row));
    } catch { skipped.push(row.id); }
  }
  return { rides: rides.filter((r) => !replaced.has(r.id)), skipped };
}

export async function getRide(id: string, c: Client = db()): Promise<Workout> {
  return rowToWorkout(await findRow(id, c));
}

/** The stored ride JSON as-is (v1 or v2), with id and the editable columns applied. The client converts v1. */
export async function getRideRaw(id: string, c: Client = db()): Promise<Record<string, unknown>> {
  return rowToRaw(await findRow(id, c));
}

/** True when the stored ride is v2. The old (v1) builder must not overwrite it. */
export async function isV2(id: string, c: Client = db()): Promise<boolean> {
  return (await getRideRaw(id, c)).schemaVersion === 2;
}

export async function createRide(w: Workout, c: Client = db()): Promise<Workout> {
  return rowToWorkout(must(await c.from("rides").insert(workoutToRow(w)).select("*").single()) as RideRow);
}

export async function createRideV2(r: Ride, c: Client = db()): Promise<Workout> {
  return rowToWorkout(must(await c.from("rides").insert(rideToRow(r)).select("*").single()) as RideRow);
}

async function updateRow(id: string, fields: Record<string, unknown>, c: Client): Promise<Workout> {
  const row = must(await c.from("rides").update(fields).eq("id", id).select("*").maybeSingle()) as RideRow | null;
  if (!row) throw new NotFound(`Ride ${id} not found`);
  return rowToWorkout(row);
}

export const updateRide = (id: string, w: Workout, c: Client = db()) => updateRow(id, workoutToRow(w), c);
export const updateRideV2 = (id: string, r: Ride, c: Client = db()) => updateRow(id, rideToRow(r), c);

export async function deleteRide(id: string, c: Client = db()): Promise<void> {
  const gone = (must(await c.from("rides").delete().eq("id", id).select("id")) ?? []) as { id: string }[];
  if (!gone.length) throw new NotFound(`Ride ${id} not found`);
}

/** The parts of a ride the music planner edits. Everything else (the segments) is left exactly as stored. */
export interface RideMeta {
  tracklist?: Ride["tracklist"];
  playlistUrl?: string;
  genre?: string; vibe?: string; eras?: string[]; genres?: string[]; seeds?: string; artistOnly?: boolean;
}

/** Saves music-planner changes in place, without touching the segments. A stored v1 ride is converted in place (its id stays). */
export async function patchRideMeta(id: string, meta: RideMeta, c: Client = db()): Promise<Workout> {
  const row = await findRow(id, c);
  const raw = rowToRaw(row);
  const base = readRide(raw).ride;
  const next: Ride = parseRideV2({ ...base, ...meta, id: row.id, sourceId: base.sourceId });
  return updateRideV2(id, next, c);
}
