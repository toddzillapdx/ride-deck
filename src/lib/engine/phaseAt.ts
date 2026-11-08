import type { Phase } from "./types";

export interface PhasePosition {
  index: number;
  phase: Phase;
  next?: Phase;
  /** Seconds left in this phase. */
  phaseLeftSec: number;
  /** Seconds left in this phase's whole segment. */
  segmentLeftSec: number;
  /** True once the structured ride is over (then phase is the last one and the left values are 0). */
  done: boolean;
}

/** Phases are half-open [start, end): at exactly `end` you are in the next phase. */
export function phaseAt(phases: Phase[], elapsedSec: number): PhasePosition | undefined {
  if (phases.length === 0) return undefined;
  const e = Math.max(0, elapsedSec);
  let index = phases.findIndex((p) => e < p.endSec);
  const done = index === -1;
  if (done) index = phases.length - 1;
  const phase = phases[index];
  let segEnd = phase.endSec;
  for (let i = index + 1; i < phases.length && phases[i].segmentIndex === phase.segmentIndex; i++) segEnd = phases[i].endSec;
  return {
    index, phase, next: phases[index + 1], done,
    phaseLeftSec: done ? 0 : phase.endSec - e,
    segmentLeftSec: done ? 0 : segEnd - e,
  };
}
