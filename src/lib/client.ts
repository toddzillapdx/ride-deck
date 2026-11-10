import { getPreset, isPresetId } from "./presets";
import { getPresetV2 } from "./presetsV2";
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
    const p = getPresetV2(id);
    if (p) return p;
    const old = getPreset(id);
    if (!old) throw new Error("Ride not found");
    return readRide(old).ride;
  }
  const res = await fetch(`/api/rides/${encodeURIComponent(id)}?format=raw`, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Couldn't load ride (${res.status})`);
  return readRide(body).ride;
}

export interface LoadedRide {
  ride: Ride;
  /** Converted from a v1 ride on read. */
  converted: boolean;
}

/** Like loadRide, but also says whether the ride was converted from v1 on read. */
export async function loadRideEx(id: string): Promise<LoadedRide> {
  if (isPresetId(id)) return { ride: await loadRide(id), converted: false };
  const res = await fetch(`/api/rides/${encodeURIComponent(id)}?format=raw`, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Couldn't load ride (${res.status})`);
  const r = readRide(body);
  return { ride: r.ride, converted: r.converted };
}
