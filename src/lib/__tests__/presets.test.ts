import { describe, expect, it } from "vitest";
import { PRESETS } from "../presets";
import { PRESETS_V2 } from "../presetsV2";
import { parseRideV2, rideDuration, validateRide } from "../engine";

describe("v2 presets", () => {
  it("same ids as the v1 starters, and every one is a valid ride", () => {
    expect(PRESETS_V2.map((p) => p.id).sort()).toEqual(PRESETS.map((p) => p.id).sort());
    for (const p of PRESETS_V2) {
      expect(() => parseRideV2(p), p.id).not.toThrow();
      expect(validateRide(p).filter((w) => w.code !== "song-duration-missing"), p.id).toEqual([]);
    }
  });
  it("keeps the advertised length (within a minute)", () => {
    const mins: Record<string, number> = { "preset-beginner-20": 20, "preset-hills-sprints-30": 30, "preset-endurance-45": 45, "preset-hiit-20": 20, "preset-hill-repeats-30": 30, "preset-free-ride": 30 };
    for (const p of PRESETS_V2) expect(Math.abs(rideDuration(p) - mins[p.id] * 60), p.id).toBeLessThanOrEqual(60);
  });
});
