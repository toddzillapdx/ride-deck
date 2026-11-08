import { describe, expect, it } from "vitest";
import { fromRecord } from "../airtable";
import { readRide, rideDuration } from "../engine";

const v2 = {
  schemaVersion: 2, id: "", sourceId: "recOLD", name: "X", genre: "Rock",
  segments: [
    { type: "flat", role: "warmup", name: "W", durationSec: 60, cadence: [70, 80], effort: [2, 3], cue: "" },
    { type: "interval", name: "S", workKind: "sprint", ratio: "1:1", workSec: 30, restSec: 30, rounds: 2, work: { cadence: [110, 120], effort: [8, 9] }, rest: { cadence: [70, 80], effort: [2, 3] }, cue: "" },
    { type: "hill", name: "H", durationSec: 120, cadence: [60, 70], effortFrom: 4, effortTo: 6, cue: "" },
  ],
  tracklist: [{ segmentIndex: 0, title: "t", artist: "a", durationSec: 200 }],
};

describe("v2 records in the library path", () => {
  it("a v2 record loads for the v1-shaped library with the right total and keeps its id", () => {
    const w = fromRecord({ id: "recNEW", fields: { Name: "X", WorkoutJson: JSON.stringify(v2) } });
    expect(w.id).toBe("recNEW");
    expect(w.segments.reduce((t, s) => t + s.durationSec, 0)).toBe(rideDuration(readRide(v2).ride));
    expect(w.tracklist?.[0].durationSec).toBe(200);
  });
  it("sourceId survives a strict re-read", () => {
    expect(readRide(v2).ride.sourceId).toBe("recOLD");
  });
});
