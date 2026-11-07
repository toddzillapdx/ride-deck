import { describe, expect, it } from "vitest";
import { TEMPLATES, applyFit, applyTracks, tracksFromDraft, assignSongs, deleteSeg, draftTotals, emptyDraft, fromRide, mergeSongs, moveSeg, newFlat, newSeg, toRide } from "../builderV2";
import { PRESETS_V2 } from "../presetsV2";
import { parseTracklist, readRide, rideDuration } from "../engine";

const song = (t: string, sec?: number) => ({ title: t, artist: "A", durationSec: sec });

describe("builder draft", () => {
  it("round-trips every preset through the form without changing it", () => {
    for (const p of PRESETS_V2) {
      const back = toRide(fromRide(p), p.id);
      expect(back.segments, p.id).toEqual(readRide(p).ride.segments);
    }
  });

  it("templates produce valid rides with the right lengths", () => {
    const d = emptyDraft();
    d.name = "t";
    d.segments = TEMPLATES.map((t) => t.make());
    const ride = toRide(d);
    // every template defaults to 4:00
    expect(rideDuration(ride)).toBe(5 * 240);
    expect(ride.segments.map((s) => (s.type === "interval" ? s.rounds : 0))).toEqual([0, 0, 4, 4, 0]);
  });

  it("an out-of-range effort names the segment", () => {
    const d = emptyDraft();
    d.name = "t";
    d.segments[1] = newFlat("steady", { effMax: "11" });
    expect(() => toRide(d)).toThrow(/Segment 2.*effort/);
    expect(draftTotals(d).error).toMatch(/Segment 2/);
  });

  it("validator warnings reach the totals (ratio mismatch, short last rest)", () => {
    const d = emptyDraft();
    d.name = "t";
    d.segments = [newSeg("interval", { ratio: "2:1", workSec: "30", restSec: "30", rounds: "2", adjust: "-27" })];
    expect(draftTotals(d).warnings.map((w) => w.code).sort()).toEqual(["final-rest-short", "ratio-mismatch"]);
  });
});

describe("songs and fit", () => {
  it("merging pasted lengths updates existing songs and appends new ones", () => {
    const first = mergeSongs([], parseTracklist("A - One\nA - Two - 3:00").songs);
    expect(first.added).toBe(1);
    const again = mergeSongs(first.songs, parseTracklist("a - two - 3:30\nA - Three - 2:00").songs);
    expect(again).toMatchObject({ added: 1, updated: 1 });
    expect(again.songs.find((x) => x.title === "Two")?.durationSec).toBe(210);
  });

  it("Fit to songs lays 40/20 over a 228 s song and a hill over the next", () => {
    const d = emptyDraft();
    d.name = "t";
    d.segments = [newSeg("interval", { ratio: "2:1", workSec: "40", restSec: "20" }), newSeg("hill", { effFrom: "5", effTo: "8" })];
    d.songs = [{ key: "1", ...song("x", 228) }, { key: "2", ...song("y", 240) }];
    const out = applyFit(d);
    expect(out.errors).toEqual([]);
    const ride = toRide(out.draft);
    expect(ride.segments[0]).toMatchObject({ rounds: 4, finalRestAdjustSec: -12 });
    expect(ride.segments[1]).toMatchObject({ durationSec: 240 });
    expect(rideDuration(ride)).toBe(228 + 240);
    expect(ride.tracklist?.map((t) => t.segmentIndex)).toEqual([0, 1]);
  });

  it("Fit refuses a song with no length and says which", () => {
    const d = emptyDraft();
    d.segments = [newSeg("hill")];
    d.songs = [{ key: "1", ...song("nolen") }];
    const out = applyFit(d);
    expect(out.errors[0]).toMatch(/nolen/);
    expect(out.draft).toBe(d);
  });

  it("moving or deleting a segment takes its songs with it", () => {
    const d = emptyDraft();
    d.segments = [newFlat("warmup", { songCount: "1" }), newFlat("steady", { songCount: "2" }), newFlat("cooldown", { songCount: "1" })];
    d.songs = ["w", "s1", "s2", "c"].map((t, i) => ({ key: String(i), ...song(t, 100) }));
    const moved = moveSeg(d, 1, 0);
    expect(assignSongs(moved).map((p) => p.map((x) => x.title))).toEqual([["s1", "s2"], ["w"], ["c"]]);
    const gone = deleteSeg(d, 1);
    expect(assignSongs(gone).map((p) => p.map((x) => x.title))).toEqual([["w"], ["c"]]);
  });

  it("songs beyond the segments are kept with the last segment", () => {
    const d = emptyDraft();
    d.name = "t";
    d.segments = [newFlat("steady")];
    d.songs = [song("a", 100), song("b", 100)].map((x, i) => ({ key: String(i), ...x }));
    expect(toRide(d).tracklist).toHaveLength(2);
  });
});

describe("fit explains a shortage", () => {
  it("says how many songs it needs and how many there are", () => {
    const d = emptyDraft();
    d.segments = [newFlat("warmup"), newSeg("hill"), newSeg("interval")];
    d.songs = [{ key: "1", ...song("a", 100) }];
    const out = applyFit(d);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]).toMatch(/needs 3 songs.*You have 1/);
  });
});


describe("music tab", () => {
  it("planner tracks replace the songs, keep real lengths, and set each segment's count", () => {
    const d = emptyDraft();
    d.segments = [newFlat("warmup"), newSeg("hill")];
    d.songs = [{ key: "k", title: "Dreams", artist: "Fleetwood Mac", durationSec: 257, durationSource: "manual" }];
    const out = applyTracks(d, [
      { segmentIndex: 1, title: "Creep", artist: "Radiohead", approxDurationSec: 238 },
      { segmentIndex: 0, title: "dreams", artist: "fleetwood mac", approxDurationSec: 250 },
    ]);
    expect(out.songs.map((x) => x.title)).toEqual(["dreams", "Creep"]);
    expect(out.songs[0].durationSec).toBe(257);
    expect(out.songs[1].durationSec).toBeUndefined();
    expect(out.segments.map((s) => s.songCount)).toEqual(["1", "1"]);
    expect(tracksFromDraft(out).map((t) => t.segmentIndex)).toEqual([0, 1]);
  });
});
