import type { Segment, SegmentType, Target, Workout } from "./types";
import { fmtClock, fmtTarget } from "./format";

/**
 * Turns a block into the minute-by-minute steps the rider actually sees. Nothing is stored:
 * rides stay as blocks (one block per song), and the steps are worked out when you ride.
 *
 * - Sprint blocks (auto): 1:00 on, 1:00 off, repeating for the length of the block.
 * - Climb blocks (auto): one step per minute, resistance higher every minute. The resistance on the
 *   block is the PEAK, so a climb never goes harder than the number you set.
 * - Everything else: one steady step.
 */
export const STEP_SEC = 60;
export const RAMP_PER_MIN = 5; // resistance points added each minute
export const RAMP_MAX_RISE = 25; // total rise across a long climb, so a 10-minute climb stays sane
export const REST = { cadence: [70, 80] as [number, number], resistance: [25, 35] as [number, number], cue: "Easy. Catch your breath." };

export interface Step {
  segIndex: number;
  name: string;
  type: SegmentType;
  startSec: number;
  durationSec: number;
  cadence?: Target;
  resistance?: Target;
  cue: string;
  /** "ON" / "OFF" for intervals, "MIN 2 OF 5" for a ramp. */
  tag?: string;
  /** How early the change screen appears before this step ends. */
  warnSec: number;
}

export type Mode = "steady" | "intervals" | "ramp";

export function modeOf(seg: Pick<Segment, "type" | "pacing">): Mode {
  const p = seg.pacing ?? "auto";
  if (p !== "auto") return p;
  return seg.type === "sprint" ? "intervals" : seg.type === "climb" ? "ramp" : "steady";
}

/** Whole minutes, with the remainder folded into the last step (so lengths always add up). */
export function splitMinutes(durationSec: number): number[] {
  const n = Math.max(1, Math.round(durationSec / STEP_SEC));
  if (n === 1) return [durationSec];
  return [...Array<number>(n - 1).fill(STEP_SEC), durationSec - STEP_SEC * (n - 1)];
}

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const shift = (t: Target | undefined, d: number): Target | undefined =>
  t === undefined ? undefined : Array.isArray(t) ? [clamp(t[0] + d), clamp(t[1] + d)] : clamp(t + d);

/** Resistance offset for step i of n: 0 at the peak, climbing toward it each minute. */
export function rampOffset(i: number, n: number): number {
  if (n <= 1) return 0;
  const rise = Math.min(RAMP_PER_MIN * (n - 1), RAMP_MAX_RISE);
  return -Math.round((rise * (n - 1 - i)) / (n - 1));
}

export function expandSegment(seg: Segment, segIndex: number, startSec: number): Step[] {
  const mode = modeOf(seg);
  const parts = splitMinutes(seg.durationSec);
  const base = { segIndex, cue: seg.cue };
  if (mode === "steady" || parts.length === 1) {
    return [{ ...base, name: seg.name, type: seg.type, startSec, durationSec: seg.durationSec, cadence: seg.cadence, resistance: seg.resistance, warnSec: 10 }];
  }
  let t = startSec;
  return parts.map((d, i) => {
    const start = t;
    t += d;
    if (mode === "intervals") {
      const on = i % 2 === 0;
      return on
        ? { ...base, name: seg.name, type: seg.type, startSec: start, durationSec: d, cadence: seg.cadence, resistance: seg.resistance, tag: "ON", warnSec: 10 }
        : { ...base, name: "Recover", type: "recover" as const, startSec: start, durationSec: d, cadence: REST.cadence, resistance: REST.resistance, cue: REST.cue, tag: "OFF", warnSec: 10 };
    }
    // ramp: the segment's resistance is the peak
    return {
      ...base, name: seg.name, type: seg.type, startSec: start, durationSec: d,
      cadence: seg.cadence, resistance: shift(seg.resistance, rampOffset(i, parts.length)),
      cue: i === 0 ? seg.cue : "Add resistance. Stay smooth.",
      tag: `MIN ${i + 1} OF ${parts.length}`,
      warnSec: i < parts.length - 1 ? 5 : 10, // minute-to-minute is a small change; the end of the climb is not
    };
  });
}

export function expand(w: Pick<Workout, "segments">): Step[] {
  const out: Step[] = [];
  let t = 0;
  w.segments.forEach((s, i) => {
    out.push(...expandSegment(s, i, t));
    t += s.durationSec;
  });
  return out;
}

/** Index of the step playing at `elapsedSec` (the last step once the ride is over). */
export function stepIndexAt(steps: Step[], elapsedSec: number): number {
  const i = steps.findIndex((s) => elapsedSec < s.startSec + s.durationSec);
  return i === -1 ? Math.max(0, steps.length - 1) : i;
}

/** One line for the builder: what a block turns into. Empty for steady blocks. */
export function describeSteps(steps: Step[]): string {
  if (steps.length < 2) return "";
  if (steps[0].tag === "ON") return steps.map((s) => `${s.tag} ${fmtClock(s.durationSec)}`).join(" · ");
  return `Resistance ${steps.map((s) => fmtTarget(s.resistance)).join(" → ")}`;
}
