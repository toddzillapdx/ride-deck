import { getPreset, isPresetId } from "./presets";
import { readRide } from "./engine";
import type { Ride } from "./engine";
import type { Workout } from "./types";

export async function loadWorkout(id: string): Promise<Workout> {
  if (isPresetId(id)) {
    const p = getPreset(id);
    if (!p) throw new Error("Ride not found");
    return p;
  }
  const res = await fetch(`/api/rides/${encodeURIComponent(id)}`, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Couldn't load ride (${res.status})`);
  return body as Workout;
}

/** A ride ready to ride: v2 as stored, or a v1 ride converted on read (never rewritten). */
export async function loadRide(id: string): Promise<Ride> {
  if (isPresetId(id)) {
    const p = getPreset(id);
    if (!p) throw new Error("Ride not found");
    return readRide(p).ride;
  }
  const res = await fetch(`/api/rides/${encodeURIComponent(id)}?format=raw`, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Couldn't load ride (${res.status})`);
  return readRide(body).ride;
}
