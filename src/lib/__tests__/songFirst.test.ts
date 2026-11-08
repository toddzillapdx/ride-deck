import { describe, expect, it } from "vitest";
import { aligned, fitDraft, insertSong, newSong, removeSong, repeatSegment, replaceSong, setPlanned, suggestAll, toRide, draftTotals } from "../builderV2";
import { COOLDOWN_SEC, checkSongs, rideSeconds } from "../songFlow";
import { fitSegmentsToSongs, rideDuration, type FitTemplate } from "../engine";
import { sanitizeSongs, buildSongMessage } from "../songPlanner";
import { emptyDraft, type RideDraft, type SongDraft } from "../builderV2";

const planned = [
  { title: "Easy Start", artist: "A", intensity: 3 },
  { title: "Groove", artist: "B", intensity: 5 },
  { title: "Climb", artist: "C", intensity: 7 },
  { title: "Sprint", artist: "D", intensity: 9 },
  { title: "Mellow", artist: "E", intensity: 2 },
  { title: "Finish", artist: "F", intensity: 3 },
];
const lens = [180, 200, 260, 228, 210, 300];

function ready(): RideDraft {
  let d: RideDraft = { ...emptyDraft(), name: "Test" };
  d = setPlanned(d, planned);
  d = { ...d, songs: d.songs.map((s, i) => ({ ...s, durationSec: lens[i], durationSource: "deezer", status: "ok" as const })) };
  return d;
}

describe("song-first draft", () => {
  it("makes one segment per song: warm-up first, cool-down last, types from intensity", () => {
    const d = setPlanned(emptyDraft(), planned);
    expect(aligned(d)).toBe(true);
    expect(d.segments.map((s) => s.type)).toEqual(["flat", "flat", "hill", "interval", "flat", "flat"]);
    expect(d.segments[0]).toMatchObject({ role: "warmup" });
    expect(d.segments[5]).toMatchObject({ role: "cooldown" });
    expect(d.segments[4]).toMatchObject({ role: "recover" });
  });

  it("derives every length: song lengths for the middle, 2:00 for the cool-down", () => {
    const out = fitDraft(ready());
    expect(out.errors).toEqual([]);
    const ride = toRide(out.draft);
    const secs = ride.segments.map((s) => (s.type === "interval" ? s.rounds * (s.workSec + s.restSec) + (s.finalRestAdjustSec ?? 0) : s.durationSec));
    expect(secs).toEqual([180, 200, 260, 228, 210, COOLDOWN_SEC]);
    expect(rideDuration(ride)).toBe(rideSeconds(lens));
    expect(rideDuration(ride)).toBe(180 + 200 + 260 + 228 + 210 + 120);
  });

  it("fits the interval to its song (228 s of 30/30 ends on the song)", () => {
    const ride = toRide(fitDraft(ready()).draft);
    const iv = ride.segments[3];
    expect(iv.type).toBe("interval");
    if (iv.type === "interval") expect(iv.rounds * (iv.workSec + iv.restSec) + (iv.finalRestAdjustSec ?? 0)).toBe(228);
  });

  it("refuses to fit while a song has no length", () => {
    const d = ready();
    d.songs[2] = { ...d.songs[2], durationSec: undefined };
    expect(fitDraft(d).errors.join(" ")).toMatch(/length/i);
  });

  it("the saved ride keeps every song on its own segment, with the album", () => {
    const d = ready();
    d.songs[1] = { ...d.songs[1], album: "Some Album" };
    const ride = toRide(fitDraft(d).draft);
    expect(ride.tracklist?.map((t) => t.segmentIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(ride.tracklist?.[1].album).toBe("Some Album");
    expect(draftTotals(fitDraft(d).draft).error).toBeUndefined();
  });

  it("insert, swap and remove keep songs and segments together; the ends stay warm-up and cool-down", () => {
    let d = ready();
    d = insertSong(d, 5, newSong({ title: "Extra", artist: "G", intensity: 8 }));
    expect(aligned(d)).toBe(true);
    expect(d.songs[5].title).toBe("Extra");
    expect(d.segments[5].type).toBe("interval");
    expect(d.segments[6]).toMatchObject({ role: "cooldown" });
    const hill = d.segments[2];
    d = replaceSong(d, 2, { ...d.songs[2], key: "k", title: "Other Climb" } as SongDraft);
    expect(d.segments[2]).toBe(hill); // the rider's settings survive a swap
    d = removeSong(d, 0);
    expect(d.segments[0]).toMatchObject({ role: "warmup" });
    expect(aligned(d)).toBe(true);
  });

  it("repeat copies the settings from the segment above", () => {
    let d = ready();
    d = { ...d, segments: d.segments.map((s, i) => (i === 3 ? { ...s, wEffMin: "9", wEffMax: "10", workKind: "resistance" as const } : s)) };
    d = repeatSegment(d, 3, 4);
    expect(d.segments[4]).toMatchObject({ type: "interval", workKind: "resistance", wEffMin: "9" });
    expect(d.segments[4].key).not.toBe(d.segments[3].key);
  });

  it("re-suggest rebuilds from the music", () => {
    const d = suggestAll({ ...ready(), segments: ready().segments.map((s) => ({ ...s, type: "flat" as const })) });
    expect(d.segments.map((s) => s.type)).toEqual(["flat", "flat", "hill", "interval", "flat", "flat"]);
  });
});

describe("cool-down in the engine", () => {
  const t = (name: string, role: "warmup" | "steady" | "cooldown"): FitTemplate => ({ type: "flat", role, name, cadence: 80, effort: 3, cue: "", songs: 1 });
  it("runs 2:00 even though the song is longer", () => {
    const f = fitSegmentsToSongs([{ title: "a", artist: "x", durationSec: 200 }, { title: "b", artist: "y", durationSec: 300 }], [t("w", "warmup"), t("c", "cooldown")], { cooldownSec: 120 });
    expect(f.segments.map((s) => (s.type === "flat" ? s.durationSec : 0))).toEqual([200, 120]);
  });
  it("without the option a cool-down still takes the whole song (old behaviour)", () => {
    const f = fitSegmentsToSongs([{ title: "b", artist: "y", durationSec: 300 }], [t("c", "cooldown")]);
    expect(f.segments[0]).toMatchObject({ durationSec: 300 });
  });
  it("warns when the last song is shorter than the cool-down", () => {
    const f = fitSegmentsToSongs([{ title: "b", artist: "y", durationSec: 100 }], [t("c", "cooldown")], { cooldownSec: 120 });
    expect(f.warnings.length).toBe(1);
  });
});

describe("window and checks use the same numbers as the saved ride", () => {
  it("agree", () => {
    const d = ready();
    expect(checkSongs(d.songs, 17).rideSec).toBe(rideDuration(toRide(fitDraft(d).draft)));
  });
});

describe("song planner output", () => {
  const input = { eras: ["80s"], genres: [], vibe: "Classic", seeds: "", artistOnly: false, targetMin: 30, count: 3, avoid: ["Old Song"], keep: [{ artist: "Z", title: "Kept" }] };
  it("drops repeats, avoided and kept songs, clamps intensity, caps the count", () => {
    const raw = { songs: [
      { title: "One", artist: "A", intensity: 14, genre: "Rock", era: "80s", approxDurationSec: 215, reason: "r" },
      { title: "one", artist: "a", intensity: 3, genre: "", era: "80s", approxDurationSec: 215, reason: "dup" },
      { title: "Old Song", artist: "B", intensity: 5, genre: "", era: "90s", approxDurationSec: 200, reason: "" },
      { title: "Kept", artist: "Z", intensity: 5, genre: "", era: "80s", approxDurationSec: 200, reason: "" },
      { title: "Two", artist: "C", intensity: -3, genre: "", era: "70s", approxDurationSec: 99999, reason: "" },
      { title: "Three", artist: "D", intensity: 5, genre: "", era: "80s", approxDurationSec: 200, reason: "" },
      { title: "Four", artist: "E", intensity: 5, genre: "", era: "80s", approxDurationSec: 200, reason: "" },
    ] };
    const out = sanitizeSongs(raw, input);
    expect(out.map((s) => s.title)).toEqual(["One", "Two", "Three"]);
    expect(out[0].intensity).toBe(10);
    expect(out[1].intensity).toBe(1);
    expect(out[1].era).toBe("Other");
    expect(out[1].approxDurationSec).toBe(600);
  });
  it("a one-song request asks for the right job and length", () => {
    const first = buildSongMessage({ ...input, slot: { index: 0, total: 9 } });
    expect(first).toMatch(/FIRST song/);
    expect(first).toMatch(/2:30 to 3:30/);
    const last = buildSongMessage({ ...input, slot: { index: 8, total: 9 } });
    expect(last).toMatch(/LAST song/);
    expect(last).toMatch(/at least 2:00/);
    const mid = buildSongMessage({ ...input, slot: { index: 4, total: 9, wantSec: 250 } });
    expect(mid).toMatch(/about 4:10/);
  });
  it("a full list asks for the count and the arc", () => {
    const m = buildSongMessage({ ...input, count: 9 });
    expect(m).toMatch(/exactly 9 songs/);
  });
});

import { buildPhases, phaseAt } from "../engine";
describe("the saved ride plays on the song clock", () => {
  it("ends 2:00 into the last song; the last phase is the cool-down", () => {
    const ride = toRide(fitDraft(ready()).draft);
    const phases = buildPhases(ride);
    const end = phases[phases.length - 1];
    expect(end.endSec).toBe(180 + 200 + 260 + 228 + 210 + 120);
    expect(end.endSec - end.startSec).toBe(120);
    expect(end.segmentIndex).toBe(5);
    // every song-backed segment starts exactly where the previous song ends
    const starts = ride.segments.map((_, i) => phases.find((p) => p.segmentIndex === i)!.startSec);
    expect(starts).toEqual([0, 180, 380, 640, 868, 1078]);
    expect(phaseAt(phases, 1078)?.phase.segmentIndex).toBe(5);
    expect(phaseAt(phases, 1078 + 120)?.done).toBe(true);
  });
});
