import type { HillSegment, IntervalSegment, Phase, Ride, RideSegment } from "./types";

const FLAT_LABEL = { warmup: "Warm-up", steady: "Steady", recover: "Recover", cooldown: "Cool-down" } as const;

/** Total seconds of one segment. */
export function segmentDuration(s: RideSegment): number {
  if (s.type === "interval") return s.rounds * (s.workSec + s.restSec) + (s.finalRestAdjustSec ?? 0);
  return s.durationSec;
}

export function rideDuration(r: Pick<Ride, "segments">): number {
  return r.segments.reduce((t, s) => t + segmentDuration(s), 0);
}

export function hillLevels(s: Pick<HillSegment, "effortFrom" | "effortTo">): number {
  return Math.abs(s.effortTo - s.effortFrom) + 1;
}

function intervalPhases(s: IntervalSegment, segmentIndex: number, t0: number): Phase[] {
  const out: Phase[] = [];
  let t = t0;
  for (let r = 1; r <= s.rounds; r++) {
    out.push({
      segmentIndex, kind: "work", startSec: t, endSec: t + s.workSec,
      cadence: s.work.cadence, effort: s.work.effort, label: "WORK", round: r, roundsTotal: s.rounds,
    });
    t += s.workSec;
    const rest = r === s.rounds ? s.restSec + (s.finalRestAdjustSec ?? 0) : s.restSec;
    out.push({
      segmentIndex, kind: "rest", startSec: t, endSec: t + rest,
      cadence: s.rest.cadence, effort: s.rest.effort, label: "REST", round: r, roundsTotal: s.rounds,
    });
    t += rest;
  }
  return out;
}

/** Every hill ends with this many easy seconds, so it never runs straight into an interval. */
export const HILL_COOLDOWN_SEC = 20;
/** What the recovery asks for: an easy spin. */
export const HILL_COOL_CUE = { cadence: [70, 80] as [number, number], effort: [2, 3] as [number, number] };

/** Seconds of recovery at the end of a hill. None for a one-level hill (it rides as flat); never more than a quarter of the hill. */
export function hillCoolSec(s: Pick<HillSegment, "durationSec" | "cooldownSec" | "effortFrom" | "effortTo">): number {
  if (hillLevels(s) < 2) return 0;
  return Math.max(0, Math.min(Math.round(s.cooldownSec ?? HILL_COOLDOWN_SEC), Math.floor(s.durationSec / 4)));
}

function hillPhases(s: HillSegment, segmentIndex: number, t0: number): Phase[] {
  const levels = hillLevels(s);
  const dir = s.effortTo >= s.effortFrom ? 1 : -1;
  const cool = hillCoolSec(s);
  const climb = s.durationSec - cool; // the steps share this; the recovery takes the rest
  const out: Phase[] = [];
  for (let i = 0; i < levels; i++) {
    // Integer, contiguous boundaries. The last step always ends exactly where the recovery starts.
    const a = s.stepSec ? i * s.stepSec : Math.round((i * climb) / levels);
    const b = i === levels - 1 ? climb : s.stepSec ? (i + 1) * s.stepSec : Math.round(((i + 1) * climb) / levels);
    if (a >= climb) break; // stepSec too long for the remaining levels
    const last = i === levels - 1 || b >= climb;
    out.push({
      segmentIndex, kind: "hillStep", startSec: t0 + a, endSec: t0 + (last ? climb : b),
      cadence: s.cadence, effort: s.effortFrom + dir * i, label: s.name, step: i + 1, stepsTotal: levels,
    });
    if (last) break;
  }
  if (cool > 0) out.push({ segmentIndex, kind: "hillCool", startSec: t0 + climb, endSec: t0 + s.durationSec, cadence: HILL_COOL_CUE.cadence, effort: HILL_COOL_CUE.effort, label: "Recover" });
  return out;
}

/** Expands every segment into a flat, ordered list of phases with absolute start and end seconds. */
export function buildPhases(ride: Pick<Ride, "segments">): Phase[] {
  const out: Phase[] = [];
  let t = 0;
  ride.segments.forEach((s, i) => {
    if (s.type === "flat") {
      out.push({
        segmentIndex: i, kind: "flat", startSec: t, endSec: t + s.durationSec,
        cadence: s.cadence, effort: s.effort, label: s.name || FLAT_LABEL[s.role],
      });
    } else if (s.type === "interval") out.push(...intervalPhases(s, i, t));
    else if (s.effortFrom === s.effortTo) {
      // A hill with one level is just a flat stretch (validateRide warns).
      out.push({
        segmentIndex: i, kind: "flat", startSec: t, endSec: t + s.durationSec,
        cadence: s.cadence, effort: s.effortFrom, label: s.name,
      });
    } else out.push(...hillPhases(s, i, t));
    t += segmentDuration(s);
  });
  return out;
}
