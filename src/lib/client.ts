import { getPreset, isPresetId } from "./presets";
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
