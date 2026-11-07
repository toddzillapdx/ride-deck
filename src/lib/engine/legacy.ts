import { segmentDuration } from "./buildPhases";
import type { Ride, Target } from "./types";

type V1Type = "warmup" | "flat" | "climb" | "sprint" | "recover" | "cooldown";

/**
 * INTERIM. History and its charts still speak v1 (resistance 0-100) until the History rework.
 * This maps a v2 ride to that shape, with effort x 10 standing in for resistance, so a finished
 * ride can still be logged. Not used for riding.
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
