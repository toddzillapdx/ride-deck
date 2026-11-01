import type { SegmentType, Target, Workout } from "./types";
import { parseWorkout } from "./validate";

/** What we keep of each segment. A snapshot, so history survives later edits to the ride. */
export interface SegSnapshot {
  name: string;
  type: SegmentType;
  durationSec: number;
  cadence?: Target;
  resistance?: Target;
}

export interface RideLog {
  id: string;
  rideId: string;
  rideName: string;
  startedAt: string; // ISO
  elapsedSec: number;
  plannedSec: number;
  segmentsCompleted: number;
  segmentsTotal: number;
  /** Calories typed in from the Peloton screen. RideDeck never reads bike data. */
  kcal?: number;
  notes?: string;
  segments: SegSnapshot[];
}

export type LogInput = Omit<RideLog, "id">;

export const snapshot = (w: Workout): SegSnapshot[] =>
  w.segments.map(({ name, type, durationSec, cadence, resistance }) => ({ name, type, durationSec, cadence, resistance }));

export const KCAL_MAX = 5000;

/** "" or null clears the value (returns null). Anything else must be a whole number 0..5000. */
export function parseKcal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    v = Number(t);
  }
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > KCAL_MAX) throw new Error(`Calories must be a whole number from 0 to ${KCAL_MAX}`);
  return v;
}

const int = (v: unknown, label: string, max: number): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) throw new Error(`${label} must be a whole number from 0 to ${max}`);
  return v;
};

export function parseLogInput(raw: unknown): LogInput {
  if (!raw || typeof raw !== "object") throw new Error("Body must be a JSON object");
  const o = raw as Record<string, unknown>;
  if (typeof o.rideName !== "string" || !o.rideName.trim()) throw new Error("rideName is required");
  if (typeof o.rideId !== "string") throw new Error("rideId is required");
  if (typeof o.startedAt !== "string" || Number.isNaN(Date.parse(o.startedAt))) throw new Error("startedAt must be an ISO date");
  if (!Array.isArray(o.segments) || o.segments.length === 0) throw new Error("segments are required");
  // Reuse the workout validator for the snapshot; cue isn't kept.
  const w = parseWorkout({ name: o.rideName, segments: o.segments.map((s) => ({ ...(s as object), cue: "" })) });
  const segmentsTotal = w.segments.length;
  const segmentsCompleted = int(o.segmentsCompleted, "segmentsCompleted", segmentsTotal);
  const kcal = o.kcal === undefined ? null : parseKcal(o.kcal);
  const notes = typeof o.notes === "string" && o.notes.trim() ? o.notes.trim().slice(0, 2000) : undefined;
  return {
    rideId: o.rideId.slice(0, 100),
    rideName: o.rideName.trim().slice(0, 200),
    startedAt: new Date(o.startedAt).toISOString(),
    elapsedSec: int(o.elapsedSec, "elapsedSec", 24 * 3600),
    plannedSec: int(o.plannedSec, "plannedSec", 24 * 3600),
    segmentsCompleted,
    segmentsTotal,
    ...(kcal === null ? {} : { kcal }),
    ...(notes ? { notes } : {}),
    segments: snapshot(w),
  };
}

export function parseLogPatch(raw: unknown): { kcal?: number | null; notes?: string | null } {
  if (!raw || typeof raw !== "object") throw new Error("Body must be a JSON object");
  const o = raw as Record<string, unknown>;
  const out: { kcal?: number | null; notes?: string | null } = {};
  if ("kcal" in o) out.kcal = parseKcal(o.kcal);
  if ("notes" in o) out.notes = typeof o.notes === "string" && o.notes.trim() ? o.notes.trim().slice(0, 2000) : null;
  if (!("kcal" in out) && !("notes" in out)) throw new Error("Nothing to update");
  return out;
}

export const totals = (logs: RideLog[]) => ({
  rides: logs.length,
  seconds: logs.reduce((n, l) => n + l.elapsedSec, 0),
  kcal: logs.reduce((n, l) => n + (l.kcal ?? 0), 0),
});
