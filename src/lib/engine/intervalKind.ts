import type { IntervalKind } from "./types";

/** A sprint is fast legs; a resistance interval is heavy and slower. Below this work cadence a "sprint" is really a heavy interval. */
export const SPRINT_MIN_CADENCE = 90;
/** At or above this work cadence a "resistance" interval is really a sprint. */
export const RESISTANCE_MAX_CADENCE = 100;

export interface KindProblem { fixTo: IntervalKind; message: string }

const label = (k: IntervalKind) => (k === "sprint" ? "Sprint" : "Resistance");

/**
 * Does an interval's kind agree with its name and its work cadence? A mismatch is how a heavy interval ends up labelled "Sprint" on the
 * ride screen: the label comes from the kind, while the name and numbers say something else. Returns what to change it to, or null.
 * `cadMin`/`cadMax` are the work cadence range.
 */
export function intervalKindProblem(kind: IntervalKind, name: string, cadMin: number, cadMax: number): KindProblem | null {
  const named: IntervalKind | null = /resist|heavy/i.test(name) ? "resistance" : /sprint/i.test(name) ? "sprint" : null;
  if (named && named !== kind) {
    return { fixTo: named, message: `"${name}" is set up as ${label(kind)} intervals, but its name says ${label(named)}. The ride screen will say ${label(kind)}.` };
  }
  if (kind === "sprint" && Number.isFinite(cadMax) && cadMax > 0 && cadMax < SPRINT_MIN_CADENCE) {
    return { fixTo: "resistance", message: `A sprint with work cadence ${cadMin}–${cadMax} is slow for a sprint. If it is meant to be heavy, make it Resistance.` };
  }
  if (kind === "resistance" && Number.isFinite(cadMin) && cadMin >= RESISTANCE_MAX_CADENCE) {
    return { fixTo: "sprint", message: `A resistance interval with work cadence ${cadMin}–${cadMax} is fast for a heavy interval. If it is meant to be fast, make it a Sprint.` };
  }
  return null;
}
