import { describe, expect, it } from "vitest";
import { parseLogInput, parseLogPatch } from "../history";
import { stretchesFor, DEFAULT_STRETCHES } from "../engine";

const base = {
  rideName: "r", rideId: "x", startedAt: "2026-11-07T10:00:00Z", elapsedSec: 1800, plannedSec: 1800, segmentsCompleted: 1,
  segments: [{ name: "F", type: "flat", durationSec: 60, cadence: [80, 90], resistance: [40, 50] }],
};

describe("history (V1.5 fields)", () => {
  it("accepts endedEarly, rideSec and stretchSec", () => {
    const l = parseLogInput({ ...base, endedEarly: true, rideSec: 1700, stretchSec: 0 });
    expect(l).toMatchObject({ endedEarly: true, rideSec: 1700, stretchSec: 0 });
  });
  it("older callers without them still work", () => {
    const l = parseLogInput(base);
    expect(l.endedEarly).toBeUndefined();
    expect(l.rideSec).toBeUndefined();
  });
  it("rejects nonsense seconds", () => {
    expect(() => parseLogInput({ ...base, stretchSec: -1 })).toThrow();
  });
  it("patch takes totals and calories, and still rejects empty", () => {
    expect(parseLogPatch({ elapsedSec: 1900, stretchSec: 100 })).toEqual({ elapsedSec: 1900, stretchSec: 100 });
    expect(parseLogPatch({ kcal: 312 })).toEqual({ kcal: 312 });
    expect(() => parseLogPatch({})).toThrow();
    expect(() => parseLogPatch({ kcal: 99999 })).toThrow();
  });
});

describe("stretches", () => {
  it("defaults to the six, and a ride's own list overrides", () => {
    expect(stretchesFor({})).toBe(DEFAULT_STRETCHES);
    expect(DEFAULT_STRETCHES).toHaveLength(6);
    expect(stretchesFor({ stretches: [{ name: "Neck", holdSec: 20 }] })).toEqual([{ name: "Neck", holdSec: 20 }]);
  });
});
