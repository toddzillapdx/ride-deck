import { segmentDuration } from "./buildPhases";
import type { Ride, Target } from "./types";

type V1Type = "warmup" | "flat" | "climb" | "sprint" | "recover" | "cooldown";

/**
 * INTERIM. The library, planner and old screens still speak the v1 shape (resistance x10). This maps a v2 ride to it,
 * with effort x 10 standing in for resistance. Not used for riding or History (see rideSnapshot).
 */
export function rideToLegacyWorkout(ride: Ride) {
  const x10 = (e: Target): Target => (Array.isArray(e) ? [e[0] * 10, e[1] * 10] : e * 10);
  return {
    id: ride.id,
    name: ride.name,
    segments: ride.segments.map((s) => {
      if (s.type === "flat") {
        const type: V1Type = s.role === "steady" ? "flat" : s.role;
        return { name: s.name, type, durationSec: s.durationSec, cadence: s.cadence, resistance: x10(s.effort), cue: s.cue };
      }
      if (s.type === "hill") {
        return { name: s.name, type: "climb" as V1Type, durationSec: s.durationSec, cadence: s.cadence, resistance: [s.effortFrom * 10, s.effortTo * 10] as Target, cue: s.cue };
      }
      return { name: s.name, type: "sprint" as V1Type, durationSec: segmentDuration(s), cadence: s.work.cadence, resistance: x10(s.work.effort), cue: s.cue };
    }),
  };
}

/**
 * What History keeps of a v2 ride: one entry per segment with its cadence and effort (1-10).
 * `type` uses the v1 names so the log validator and chart colors keep working.
 */
export function rideSnapshot(ride: Ride) {
  return ride.segments.map((s) => {
    if (s.type === "flat") return { name: s.name, type: (s.role === "steady" ? "flat" : s.role) as V1Type, durationSec: s.durationSec, cadence: s.cadence, effort: s.effort };
    if (s.type === "hill") return { name: s.name, type: "climb" as V1Type, durationSec: s.durationSec, cadence: s.cadence, effort: [s.effortFrom, s.effortTo] as Target };
    return { name: s.name, type: "sprint" as V1Type, durationSec: segmentDuration(s), cadence: s.work.cadence, effort: s.work.effort };
  });
}
