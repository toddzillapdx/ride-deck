import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLogInput, type LogInput, type LogPatch, type RideLog } from "../history";
import { NotFound, db, must } from "./client";

export interface LogRow {
  id: string;
  ride_id?: string | null; name?: string | null; started_at?: string | null;
  elapsed_sec?: number | null; planned_sec?: number | null; segments_completed?: number | null; segments_total?: number | null;
  kcal?: number | string | null; notes?: string | null; ended_early?: boolean | null;
  ride_seconds?: number | null; stretch_seconds?: number | null; segments?: unknown;
}

type Client = SupabaseClient;

/** Columns for a new history row. Optional fields are left out so the database defaults apply. */
export function logToRow(l: LogInput) {
  return {
    name: l.rideName, ride_id: l.rideId, started_at: l.startedAt,
    elapsed_sec: l.elapsedSec, planned_sec: l.plannedSec, segments_completed: l.segmentsCompleted, segments_total: l.segmentsTotal,
    ...(l.kcal === undefined ? {} : { kcal: l.kcal }),
    ...(l.notes ? { notes: l.notes } : {}),
    ...(l.endedEarly ? { ended_early: true } : {}),
    ...(l.rideSec === undefined ? {} : { ride_seconds: l.rideSec }),
    ...(l.stretchSec === undefined ? {} : { stretch_seconds: l.stretchSec }),
    segments: l.segments,
  };
}

/** Only the fields that were provided change. `kcal: null` clears; `notes: null` or "" clears. */
export function logPatchToRow(p: LogPatch) {
  const out: Record<string, unknown> = {};
  if ("kcal" in p) out.kcal = p.kcal ?? null;
  if ("notes" in p) out.notes = p.notes ? p.notes : null;
  if (p.elapsedSec !== undefined) out.elapsed_sec = p.elapsedSec;
  if (p.stretchSec !== undefined) out.stretch_seconds = p.stretchSec;
  return out;
}

const num = (v: unknown) => (typeof v === "number" ? v : 0);

export function rowToLog(r: LogRow): RideLog {
  let segments: RideLog["segments"] = [];
  try {
    const raw = typeof r.segments === "string" ? JSON.parse(r.segments) : r.segments ?? [];
    segments = parseLogInput({ rideName: "x", rideId: "", startedAt: "2000-01-01", elapsedSec: 0, plannedSec: 0, segmentsCompleted: 0, segments: raw }).segments;
  } catch { /* an unreadable snapshot just means no chart */ }
  // The database returns timestamps like 2026-11-08T15:00:00+00:00; the app uses ISO ...Z strings.
  const t = r.started_at ? new Date(r.started_at) : null;
  const kcal = r.kcal === null || r.kcal === undefined ? undefined : Number(r.kcal);
  return {
    id: r.id,
    rideId: typeof r.ride_id === "string" ? r.ride_id : "",
    rideName: typeof r.name === "string" ? r.name : "Ride",
    startedAt: t && !Number.isNaN(t.getTime()) ? t.toISOString() : new Date(0).toISOString(),
    elapsedSec: num(r.elapsed_sec),
    plannedSec: num(r.planned_sec),
    segmentsCompleted: num(r.segments_completed),
    segmentsTotal: num(r.segments_total) || segments.length,
    ...(kcal !== undefined && Number.isFinite(kcal) ? { kcal } : {}),
    ...(typeof r.notes === "string" && r.notes ? { notes: r.notes } : {}),
    ...(r.ended_early === true ? { endedEarly: true } : {}),
    ...(typeof r.ride_seconds === "number" ? { rideSec: r.ride_seconds } : {}),
    ...(typeof r.stretch_seconds === "number" ? { stretchSec: r.stretch_seconds } : {}),
    segments,
  };
}

const PAGE = 1000;

/** Newest first. */
export async function listLogs(c: Client = db()): Promise<RideLog[]> {
  const rows: LogRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = (must(await c.from("ride_logs").select("*").order("started_at", { ascending: false }).range(from, from + PAGE - 1)) ?? []) as LogRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows.map(rowToLog);
}

export async function createLog(l: LogInput, c: Client = db()): Promise<RideLog> {
  return rowToLog(must(await c.from("ride_logs").insert(logToRow(l)).select("*").single()) as LogRow);
}

export async function updateLog(id: string, patch: LogPatch, c: Client = db()): Promise<RideLog> {
  const fields = logPatchToRow(patch);
  if (!Object.keys(fields).length) {
    const row = must(await c.from("ride_logs").select("*").eq("id", id).maybeSingle()) as LogRow | null;
    if (!row) throw new NotFound(`History row ${id} not found`);
    return rowToLog(row);
  }
  const row = must(await c.from("ride_logs").update(fields).eq("id", id).select("*").maybeSingle()) as LogRow | null;
  if (!row) throw new NotFound(`History row ${id} not found`);
  return rowToLog(row);
}

export async function deleteLog(id: string, c: Client = db()): Promise<void> {
  const gone = (must(await c.from("ride_logs").delete().eq("id", id).select("id")) ?? []) as { id: string }[];
  if (!gone.length) throw new NotFound(`History row ${id} not found`);
}
