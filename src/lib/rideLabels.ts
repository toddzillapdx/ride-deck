import type { Phase, Ride, RideSegment, RideTrack } from "./engine";
import { COUNTDOWN_SEC } from "./rideTheme";

/** Pure helpers for the ride screen's words and countdown, kept out of the component so they can be tested. */
export interface RideViewData {
  ride: Ride;
  phases: Phase[];
  /** Index of the current phase in `phases`. */
  idx: number;
  segStarts: number[];
  segDurations: number[];
  elapsed: number;
  total: number;
  phaseLeft: number;
  /** The song that should be playing now (a guide only). */
  now?: RideTrack;
  next?: RideTrack;
}

const KIND = { sprint: "Sprint", resistance: "Resistance" } as const;

/** What the segment is called on screen. Nothing else: no counts, ratios or rounds. */
export function segTitle(s: RideSegment): string {
  return s.type === "interval" ? `Intervals · ${KIND[s.workKind]}` : s.name;
}

/** The one word for what comes next: REST, WORK, CLIMB INCREASE, SPRINT, COOL-DOWN... */
export function nextWord(ride: Ride, cur: Phase, next: Phase): string {
  const seg = ride.segments[next.segmentIndex];
  const sameSeg = next.segmentIndex === cur.segmentIndex;
  if (seg.type === "interval") return sameSeg ? (next.kind === "work" ? "WORK" : "REST") : seg.workKind === "sprint" ? "SPRINT" : "RESISTANCE";
  if (seg.type === "hill" && sameSeg) return next.kind === "hillCool" ? "RECOVER" : `${seg.name} INCREASE`.toUpperCase();
  return seg.name.toUpperCase();
}

/** The giant 3-2-1: the last few seconds of every interval phase and before every hill step-up. Never at a segment end (that flips). */
export function countdownInfo(v: RideViewData): { left: number; text: string; ice: boolean } | null {
  const p = v.phases[v.idx];
  const nx = v.phases[v.idx + 1];
  if (!nx || v.phaseLeft > COUNTDOWN_SEC || v.phaseLeft <= 0) return null;
  const sameSeg = nx.segmentIndex === p.segmentIndex;
  if (p.kind === "work" || p.kind === "rest") return sameSeg ? { left: v.phaseLeft, text: `${nextWord(v.ride, p, nx)} NEXT`, ice: p.kind === "work" } : null;
  if (p.kind === "hillStep" && sameSeg) return { left: v.phaseLeft, text: `${nextWord(v.ride, p, nx)} NEXT`, ice: false };
  return null;
}

/** Whole-ride progress along the very top: warm-up, the ride as one solid piece, cool-down. A marker shows where you are. */
export function sections(ride: Ride, durations: number[]): { warm: number; ride: number; cool: number } {
  let warm = 0, i = 0;
  while (i < ride.segments.length - 1 && ride.segments[i].type === "flat" && (ride.segments[i] as { role: string }).role === "warmup") warm += durations[i++];
  let cool = 0, j = ride.segments.length - 1;
  while (j > i && ride.segments[j].type === "flat" && (ride.segments[j] as { role: string }).role === "cooldown") cool += durations[j--];
  const all = durations.reduce((a, b) => a + b, 0);
  return { warm, ride: all - warm - cool, cool };
}

