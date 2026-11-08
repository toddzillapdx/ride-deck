import { describe, expect, it } from "vitest";
import {
  buildPhases, convertV1, effortWord, fitSegmentsToSongs, parseTracklist, phaseAt, readRide, rideDuration, validateRide,
  newClock, startClock, pauseClock, resumeClock, elapsedSec, resolveSpeed, type Ride, type V1Workout,
} from "../index";

const cue = { cadence: [70, 80] as [number, number], effort: [2, 3] as [number, number] };
const ride = (segments: Ride["segments"]): Ride => ({ schemaVersion: 2, id: "t", name: "t", segments });

describe("buildPhases", () => {
  it("flat gives one phase", () => {
    const p = buildPhases(ride([{ type: "flat", role: "warmup", name: "W", durationSec: 300, cadence: [70, 80], effort: [2, 3], cue: "" }]));
    expect(p).toHaveLength(1);
    expect([p[0].startSec, p[0].endSec, p[0].kind]).toEqual([0, 300, "flat"]);
  });

  it("interval: work/rest per round, negative finalRestAdjustSec shortens the last rest", () => {
    const r = ride([{ type: "interval", name: "S", workKind: "sprint", ratio: "2:1", workSec: 40, restSec: 20, rounds: 4, finalRestAdjustSec: -12, work: cue, rest: cue, cue: "" }]);
    const p = buildPhases(r);
    expect(p).toHaveLength(8);
    expect(p.map((x) => x.kind)).toEqual(["work", "rest", "work", "rest", "work", "rest", "work", "rest"]);
    expect(p[7].endSec - p[7].startSec).toBe(8);
    expect(p[7].endSec).toBe(228);
    expect(rideDuration(r)).toBe(228);
    expect(p[6]).toMatchObject({ round: 4, roundsTotal: 4 });
  });

  it("interval with positive adjust", () => {
    const p = buildPhases(ride([{ type: "interval", name: "S", workKind: "resistance", ratio: "1:1", workSec: 30, restSec: 30, rounds: 4, finalRestAdjustSec: 10, work: cue, rest: cue, cue: "" }]));
    expect(p[7].endSec).toBe(250);
    expect(p[7].endSec - p[7].startSec).toBe(40);
  });

  it("hill 240s from 5 to 8 has 4 levels of 60s", () => {
    const p = buildPhases(ride([{ type: "hill", name: "H", durationSec: 240, cadence: [60, 70], effortFrom: 5, effortTo: 8, cue: "" }]));
    expect(p.map((x) => [x.startSec, x.endSec, x.effort])).toEqual([[0, 60, 5], [60, 120, 6], [120, 180, 7], [180, 240, 8]]);
    expect(p[3]).toMatchObject({ step: 4, stepsTotal: 4 });
  });

  it("hill with odd split stays contiguous and ends on the segment end", () => {
    const p = buildPhases(ride([{ type: "hill", name: "H", durationSec: 250, cadence: 65, effortFrom: 5, effortTo: 7, cue: "" }]));
    expect(p[0].startSec).toBe(0);
    for (let i = 1; i < p.length; i++) expect(p[i].startSec).toBe(p[i - 1].endSec);
    expect(p[p.length - 1].endSec).toBe(250);
  });

  it("hill stepSec override; too-long steps drop later levels", () => {
    const p = buildPhases(ride([{ type: "hill", name: "H", durationSec: 200, cadence: 65, effortFrom: 4, effortTo: 9, stepSec: 90, cue: "" }]));
    expect(p.map((x) => [x.startSec, x.endSec, x.effort])).toEqual([[0, 90, 4], [90, 180, 5], [180, 200, 6]]);
  });

  it("hill with equal effort rides as flat", () => {
    const p = buildPhases(ride([{ type: "hill", name: "H", durationSec: 120, cadence: 65, effortFrom: 6, effortTo: 6, cue: "" }]));
    expect(p).toHaveLength(1);
    expect(p[0].kind).toBe("flat");
  });

  it("segments chain with absolute times", () => {
    const p = buildPhases(ride([
      { type: "flat", role: "warmup", name: "W", durationSec: 100, cadence: 70, effort: 2, cue: "" },
      { type: "hill", name: "H", durationSec: 60, cadence: 65, effortFrom: 5, effortTo: 6, cue: "" },
    ]));
    expect(p[1].startSec).toBe(100);
    expect(p[2].endSec).toBe(160);
  });
});

describe("phaseAt", () => {
  const r = ride([
    { type: "flat", role: "warmup", name: "W", durationSec: 20, cadence: 70, effort: 2, cue: "" },
    { type: "interval", name: "S", workKind: "sprint", ratio: "1:1", workSec: 10, restSec: 10, rounds: 2, work: cue, rest: cue, cue: "" },
  ]);
  const p = buildPhases(r); // flat 0-20, work 20-30, rest 30-40, work 40-50, rest 50-60
  it("boundaries are half-open", () => {
    expect(phaseAt(p, 0)!.index).toBe(0);
    expect(phaseAt(p, 19.9)!.index).toBe(0);
    expect(phaseAt(p, 20)!.index).toBe(1);
    expect(phaseAt(p, 30)!.index).toBe(2);
    expect(phaseAt(p, 59)!.index).toBe(4);
  });
  it("time left in phase and segment, and next", () => {
    const a = phaseAt(p, 25)!;
    expect(a.phaseLeftSec).toBe(5);
    expect(a.segmentLeftSec).toBe(35);
    expect(a.next?.kind).toBe("rest");
    expect(phaseAt(p, 5)!.segmentLeftSec).toBe(15);
  });
  it("done after the last phase", () => {
    const d = phaseAt(p, 60)!;
    expect(d.done).toBe(true);
    expect(d.index).toBe(4);
    expect(d.phaseLeftSec).toBe(0);
    expect(d.next).toBeUndefined();
  });
  it("empty ride", () => expect(phaseAt([], 5)).toBeUndefined());
});

describe("effortWord", () => {
  it.each([[1, "Easy"], [2, "Easy"], [3, "Comfortable"], [4, "Comfortable"], [5, "Steady"], [6, "Steady"], [7, "Hard"], [8, "Very hard"], [9, "Near max"], [10, "All out"]])("%i is %s", (n, w) => expect(effortWord(n)).toBe(w));
  it("uses the upper end of a range", () => {
    expect(effortWord([2, 3])).toBe("Comfortable");
    expect(effortWord([8, 9])).toBe("Near max");
  });
  it("clamps", () => {
    expect(effortWord(0)).toBe("Easy");
    expect(effortWord(14)).toBe("All out");
  });
});

describe("validateRide", () => {
  it("warns on ratio mismatch, short final rest, single-level hill, songs shorter than segments", () => {
    const r: Ride = {
      ...ride([
        { type: "interval", name: "A", workKind: "sprint", ratio: "1:1", workSec: 40, restSec: 20, rounds: 2, work: cue, rest: cue, cue: "" },
        { type: "interval", name: "B", workKind: "sprint", ratio: "2:1", workSec: 40, restSec: 20, rounds: 2, finalRestAdjustSec: -18, work: cue, rest: cue, cue: "" },
        { type: "hill", name: "H", durationSec: 60, cadence: 65, effortFrom: 5, effortTo: 5, cue: "" },
      ]),
      tracklist: [{ segmentIndex: 0, title: "a", artist: "b", durationSec: 60 }],
    };
    expect(validateRide(r).map((w) => w.code).sort()).toEqual(["final-rest-short", "hill-single-level", "ratio-mismatch", "songs-vs-segments"]);
  });
  it("missing song lengths are flagged", () => {
    const r: Ride = { ...ride([{ type: "flat", role: "steady", name: "F", durationSec: 60, cadence: 80, effort: 5, cue: "" }]), tracklist: [{ segmentIndex: 0, title: "a", artist: "b", approxDurationSec: 200 }] };
    expect(validateRide(r).map((w) => w.code)).toEqual(["song-duration-missing"]);
  });
  it("clean ride has none", () => {
    expect(validateRide(ride([{ type: "interval", name: "A", workKind: "sprint", ratio: "2:1", workSec: 40, restSec: 20, rounds: 4, work: cue, rest: cue, cue: "" }]))).toEqual([]);
  });
});

describe("fitSegmentsToSongs", () => {
  const song = (n: string, sec?: number) => ({ title: n, artist: "A", durationSec: sec });
  const iv = (workSec: number, restSec: number, ratio: "1:1" | "2:1") => ({ type: "interval" as const, name: "I", workKind: "sprint" as const, ratio, workSec, restSec, work: cue, rest: cue, cue: "" });

  it("228s song with 40/20: 4 rounds, adjust -12, final rest 8", () => {
    const f = fitSegmentsToSongs([song("x", 228)], [iv(40, 20, "2:1")]);
    expect(f.ok).toBe(true);
    expect(f.segments[0]).toMatchObject({ rounds: 4, finalRestAdjustSec: -12 });
  });
  it("250s song with 30/30: 4 rounds, adjust +10", () => {
    const f = fitSegmentsToSongs([song("x", 250)], [iv(30, 30, "1:1")]);
    expect(f.segments[0]).toMatchObject({ rounds: 4, finalRestAdjustSec: 10 });
  });
  it("exact multiple has no adjust", () => {
    const f = fitSegmentsToSongs([song("x", 240)], [iv(30, 30, "1:1")]);
    expect(f.segments[0]).toMatchObject({ rounds: 4 });
    expect((f.segments[0] as { finalRestAdjustSec?: number }).finalRestAdjustSec).toBeUndefined();
  });
  it("drops a round when the final rest would be under 5s", () => {
    // 40/10 has a 50s cycle: 244s rounds to 5 rounds, which would leave a 4s final rest, so it drops to 4 rounds.
    const f = fitSegmentsToSongs([song("x", 244)], [iv(40, 10, "2:1")]);
    expect(f.segments[0]).toMatchObject({ rounds: 4, finalRestAdjustSec: 44 });
  });
  it("hill duration equals the song and flat sums its songs", () => {
    const f = fitSegmentsToSongs([song("a", 200), song("b", 180), song("c", 150)], [
      { type: "flat", role: "warmup", name: "W", cadence: 70, effort: 2, cue: "", songs: 2 },
      { type: "hill", name: "H", cadence: 65, effortFrom: 5, effortTo: 8, cue: "" },
    ]);
    expect(f.ok).toBe(true);
    expect((f.segments[0] as { durationSec: number }).durationSec).toBe(380);
    expect((f.segments[1] as { durationSec: number }).durationSec).toBe(150);
    expect(f.tracklist.map((t) => t.segmentIndex)).toEqual([0, 0, 1]);
  });
  it("refuses songs without a real length and never guesses", () => {
    const f = fitSegmentsToSongs([song("a")], [{ type: "hill", name: "H", cadence: 65, effortFrom: 5, effortTo: 8, cue: "" }]);
    expect(f.ok).toBe(false);
    expect(f.errors[0]).toMatch(/length/);
    expect(f.segments).toHaveLength(0);
  });
  it("errors when songs run out; leftovers are reported as unused", () => {
    expect(fitSegmentsToSongs([], [iv(30, 30, "1:1")]).ok).toBe(false);
    const f = fitSegmentsToSongs([song("a", 120), song("b", 100)], [iv(30, 30, "1:1")]);
    expect(f.ok).toBe(true);
    expect(f.unused).toHaveLength(1);
  });
});

describe("parseTracklist", () => {
  it("parses Artist - Title - m:ss lines and reports bad ones", () => {
    const r = parseTracklist("Fleetwood Mac - Dreams - 4:17\nThe Clash, London Calling, 3:19\nnonsense line\n\nWu-Tang Clan - C.R.E.A.M. - 4:12");
    expect(r.songs.map((s) => s.durationSec)).toEqual([257, 199, 252]);
    expect(r.songs[2].title).toBe("C.R.E.A.M.");
    expect(r.bad).toEqual(["nonsense line"]);
  });
});

describe("v1 conversion", () => {
  const v1 = (segments: V1Workout["segments"]): V1Workout => ({ name: "old", segments });
  it("flat types and effort rounding half up, 0 becomes 1", () => {
    const c = convertV1(v1([
      { name: "Warm-up", type: "warmup", durationSec: 300, cadence: [70, 80], resistance: [20, 30] },
      { name: "Flat", type: "flat", durationSec: 300, cadence: [85, 95], resistance: [45, 55] },
      { name: "Rec", type: "recover", durationSec: 60, cadence: [70, 80], resistance: [0, 5] },
      { name: "Cool", type: "cooldown", durationSec: 180, cadence: [65, 75], resistance: [15, 25] },
    ]));
    const s = c.ride.segments as { role: string; effort: unknown }[];
    expect(s.map((x) => x.role)).toEqual(["warmup", "steady", "recover", "cooldown"]);
    expect(s[0].effort).toEqual([2, 3]);
    expect(s[1].effort).toEqual([5, 6]);
    expect(s[2].effort).toBe(1); // [0,5] -> 0 clamps to 1, 5 rounds half up to 1, so the range collapses
    expect(s[3].effort).toEqual([2, 3]);
  });
  it("high cadence floors effort at 8", () => {
    const c = convertV1(v1([{ name: "Fast", type: "flat", durationSec: 120, cadence: [105, 115], resistance: [20, 30] }]));
    expect((c.ride.segments[0] as { effort: unknown }).effort).toEqual(8);
  });
  it("climb becomes a hill from what was actually ridden (ramp up to the peak)", () => {
    // 300s = 5 min: rise 20 below the peak. Peak mid 60 -> 6, start mid 40 -> 4.
    const c = convertV1(v1([{ name: "Climb", type: "climb", durationSec: 300, cadence: [60, 70], resistance: [55, 65] }]));
    expect(c.ride.segments[0]).toMatchObject({ type: "hill", effortFrom: 4, effortTo: 6 });
  });
  it("a 7-minute climb is capped at +25", () => {
    const c = convertV1(v1([{ name: "Climb", type: "climb", durationSec: 420, cadence: [60, 70], resistance: [60, 70] }]));
    expect(c.ride.segments[0]).toMatchObject({ effortFrom: 4, effortTo: 7 }); // 65-25=40 -> 4 ; 65 -> 7 (round half up of 6.5)
  });
  it("a one-minute climb is widened and flagged", () => {
    const c = convertV1(v1([{ name: "Climb", type: "climb", durationSec: 60, cadence: [60, 70], resistance: [55, 65] }]));
    const h = c.ride.segments[0] as { effortFrom: number; effortTo: number };
    expect(h.effortTo).toBeGreaterThan(h.effortFrom);
    expect(c.flags).toHaveLength(1);
  });
  it("sprint becomes an interval (30/30 default, 40/20 option), duration preserved, flagged", () => {
    const sprint: V1Workout["segments"] = [{ name: "Sprint", type: "sprint", durationSec: 180, cadence: [110, 120], resistance: [30, 40] }];
    for (const mode of ["30/30", "40/20"] as const) {
      const c = convertV1(v1(sprint), { sprint: mode });
      expect(rideDuration(c.ride)).toBe(180);
      expect(c.flags).toHaveLength(1);
      expect(c.ride.segments[0]).toMatchObject({ type: "interval", workKind: "sprint" });
    }
    expect(convertV1(v1(sprint), { sprint: "40/20" }).ride.segments[0]).toMatchObject({ ratio: "2:1", workSec: 40, restSec: 20, rounds: 3 });
  });
  it("sprint 'flat' mode is the brief's mechanical fallback", () => {
    const c = convertV1(v1([{ name: "Sprint", type: "sprint", durationSec: 60, cadence: [110, 120], resistance: [30, 40] }]), { sprint: "flat" });
    expect(c.ride.segments[0]).toMatchObject({ type: "flat", role: "steady", effort: [8, 9] });
    expect(c.flags).toHaveLength(1);
  });
  it("keeps total duration and tracks; estimates stay estimates", () => {
    const c = convertV1({ name: "x", genre: "Rock", playlistUrl: "https://a.b", segments: [{ name: "F", type: "flat", durationSec: 100, cadence: 80, resistance: 50 }], tracklist: [{ segmentIndex: 0, title: "t", artist: "a", approxDurationSec: 200 }] });
    expect(c.ride.schemaVersion).toBe(2);
    expect(c.ride.genre).toBe("Rock");
    expect(c.ride.tracklist![0].durationSec).toBeUndefined();
    expect(c.ride.tracklist![0].approxDurationSec).toBe(200);
  });
});

describe("readRide", () => {
  it("converts v1 on read, validates v2, rejects junk", () => {
    const old = readRide({ name: "x", segments: [{ name: "F", type: "flat", durationSec: 60, cadence: [80, 90], resistance: [40, 50] }] });
    expect(old.converted).toBe(true);
    const v2 = readRide(old.ride);
    expect(v2.converted).toBe(false);
    expect(v2.ride.segments).toEqual(old.ride.segments);
    expect(() => readRide({ schemaVersion: 3, name: "x", segments: [] })).toThrow();
    expect(() => readRide({ schemaVersion: 2, name: "x", segments: [{ type: "flat", role: "steady", name: "F", durationSec: 60, cadence: 80, effort: 11 }] })).toThrow(/effort/);
    expect(() => readRide(null)).toThrow();
  });
});

describe("clock", () => {
  it("pause and resume are exact", () => {
    let c = startClock(newClock(), 1000);
    expect(elapsedSec(c, 11_000)).toBe(10);
    c = pauseClock(c, 11_000);
    expect(elapsedSec(c, 500_000)).toBe(10); // paused: time does not move
    c = resumeClock(c, 600_000);
    expect(elapsedSec(c, 605_000)).toBe(15);
  });
  it("double start and double pause do nothing", () => {
    let c = startClock(newClock(), 0);
    c = startClock(c, 5000);
    expect(elapsedSec(c, 10_000)).toBe(10);
    c = pauseClock(pauseClock(c, 10_000), 20_000);
    expect(elapsedSec(c, 99_000)).toBe(10);
  });
  it("speed-up works in dev and is ignored in production", () => {
    expect(resolveSpeed(30, true)).toBe(1);
    expect(resolveSpeed(30, false)).toBe(30);
    expect(resolveSpeed(7, false)).toBe(1);
    expect(elapsedSec(startClock(newClock(10), 0), 6000)).toBe(60);
  });
});
