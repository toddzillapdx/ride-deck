import { describe, expect, it } from "vitest";
import { buildPhases, segmentDuration, type Ride } from "../engine";
import { PRESETS_V2 } from "../presetsV2";
import { countdownInfo, nextWord, sections, segTitle, type RideViewData } from "../rideLabels";

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
    expect(countdownInfo(view(steps[steps.length - 1].endSec - 2, hills))).toBeNull();
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
