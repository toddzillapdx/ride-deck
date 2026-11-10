import { describe, expect, it } from "vitest";
import { buildPhases, segmentDuration, type Ride } from "../engine";
import { PRESETS_V2 } from "../presetsV2";
import { countdownInfo, nextWord, sections, segmentBar, segTitle, type RideViewData } from "../rideLabels";

const hiit = PRESETS_V2.find((p) => p.id === "preset-hiit-20") as Ride; // warm 3, sprint 40/20 x6, recover 2, resistance 30/30 x6, cool 3
const phases = buildPhases(hiit);
const durations = hiit.segments.map(segmentDuration);
const view = (elapsed: number, ride: Ride = hiit): RideViewData => {
  const ph = ride === hiit ? phases : buildPhases(ride);
  const idx = ph.findIndex((p) => elapsed < p.endSec);
  return { ride, phases: ph, idx, segStarts: [], segDurations: ride.segments.map(segmentDuration), elapsed, total: 0, phaseLeft: ph[idx].endSec - elapsed };
};

describe("ride screen words", () => {
  it("names a segment simply", () => {
    expect(segTitle(hiit.segments[1])).toBe("Intervals · Sprint");
    expect(segTitle(hiit.segments[3])).toBe("Intervals · Resistance");
    expect(segTitle(hiit.segments[0])).toBe("Warm-up");
  });
  it("says only the one word for what is next", () => {
    const warm = phases[0], work = phases[1], rest = phases[2];
    expect(nextWord(hiit, warm, work)).toBe("SPRINT");
    expect(nextWord(hiit, work, rest)).toBe("REST");
    expect(nextWord(hiit, rest, phases[3])).toBe("WORK");
    const hills = PRESETS_V2.find((p) => p.id === "preset-hill-repeats-30") as Ride;
    const hp = buildPhases(hills);
    const firstHill = hp.findIndex((p) => p.kind === "hillStep");
    expect(nextWord(hills, hp[firstHill], hp[firstHill + 1])).toBe("HILL INCREASE");
    expect(nextWord(hills, hp[firstHill + 2], hp[firstHill + 3])).toBe("RECOVER");
  });
});

describe("3-2-1", () => {
  it("shows in the last 3 s of an interval phase with what is next, and not before", () => {
    const w = phases[1]; // first WORK, 40 s
    expect(countdownInfo(view(w.endSec - 4))).toBeNull();
    expect(countdownInfo(view(w.endSec - 2.5))).toMatchObject({ text: "REST NEXT", ice: true });
  });
  it("shows before each hill step-up, but not at the end of a segment (that flips instead)", () => {
    const hills = PRESETS_V2.find((p) => p.id === "preset-hill-repeats-30") as Ride;
    const hp = buildPhases(hills);
    const steps = hp.filter((p) => p.kind === "hillStep" && p.segmentIndex === 1);
    expect(countdownInfo(view(steps[0].endSec - 2, hills))).toMatchObject({ text: "HILL INCREASE NEXT" });
    // the top step warns that the recovery is next; the recovery itself ends the segment, which flips instead
    expect(countdownInfo(view(steps[steps.length - 1].endSec - 2, hills))).toMatchObject({ text: "RECOVER NEXT" });
    const cool = hp.find((p) => p.kind === "hillCool" && p.segmentIndex === 1)!;
    expect(countdownInfo(view(cool.endSec - 2, hills))).toBeNull();
  });
  it("not in the last interval phase of a segment (the flip covers it)", () => {
    const lastRest = phases.filter((p) => p.segmentIndex === 1).at(-1)!;
    expect(countdownInfo(view(lastRest.endSec - 2))).toBeNull();
  });
});

describe("progress line sections", () => {
  it("warm-up, one ride section, cool-down", () => {
    const s = sections(hiit, durations);
    expect(s).toEqual({ warm: 180, ride: 20 * 60 - 360, cool: 180 });
  });
  it("a ride with no warm-up or cool-down is one solid section", () => {
    const free = PRESETS_V2.find((p) => p.id === "preset-free-ride") as Ride;
    expect(sections(free, free.segments.map(segmentDuration))).toEqual({ warm: 0, ride: 1800, cool: 0 });
  });
});

describe("segment bar (the same for every segment type)", () => {
  const full = (ride: Ride, elapsed: number): RideViewData => {
    const ph = buildPhases(ride);
    const durs = ride.segments.map(segmentDuration);
    const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, b) => a + b, 0));
    const idx = ph.findIndex((p) => elapsed < p.endSec);
    return { ride, phases: ph, idx, segStarts: starts, segDurations: durs, elapsed, total: durs.reduce((a, b) => a + b, 0), phaseLeft: ph[idx].endSec - elapsed };
  };
  it("a flat segment is a line with a marker and no breaks", () => {
    const b = segmentBar(full(hiit, 90)); // warm-up, 3:00 long
    expect(b.breaks).toEqual([]);
    expect(b.pct).toBeCloseTo(50, 5);
  });
  it("an interval has a break at the start of every round after the first", () => {
    const b = segmentBar(full(hiit, 180 + 10)); // sprint 40/20 x 6: round 1
    expect(b.breaks).toHaveLength(5);
    expect(b.breaks[0]).toBeCloseTo(1 / 6, 5);
    expect(b.pct).toBeCloseTo((10 / 360) * 100, 5);
  });
  it("a hill has a break at every step and at the recovery", () => {
    const hills = PRESETS_V2.find((p) => p.id === "preset-hill-repeats-30") as Ride;
    const ph = buildPhases(hills);
    const firstStep = ph.find((p) => p.kind === "hillStep")!;
    const steps = ph.filter((p) => p.segmentIndex === firstStep.segmentIndex);
    const b = segmentBar(full(hills, firstStep.startSec + 1));
    expect(b.breaks).toHaveLength(steps.length - 1); // one break per phase after the first (steps and the recovery)
    expect(b.breaks.every((f, i, a) => f > 0 && f < 1 && (i === 0 || f > a[i - 1]))).toBe(true);
    expect(steps[steps.length - 1].kind).toBe("hillCool");
  });
  it("stays inside 0..100 at the very start and end of a segment", () => {
    expect(segmentBar(full(hiit, 0)).pct).toBe(0);
    expect(segmentBar(full(hiit, 179.99)).pct).toBeLessThanOrEqual(100);
  });
});
