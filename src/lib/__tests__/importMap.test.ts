import { describe, expect, it } from "vitest";
import { buildPlan, mapLog, mapRide, mapSettings, mapSong, recsFromBackup, SETTINGS_NAME, type AtRec } from "../../../scripts/importMap";
import { PRESETS_V2 } from "../presetsV2";

const wj = (o: unknown) => JSON.stringify(o);
const ride = (id: string, name: string, extra: Record<string, unknown> = {}): AtRec => ({
  id, fields: { Name: name, Genre: "Rock", Vibe: "", TotalSeconds: 600, PlaylistUrl: "https://p.example/1", UpdatedAt: "2026-11-01T10:00:00.000Z", WorkoutJson: wj({ ...PRESETS_V2[0], id: "inner-id", name }), ...extra },
});
const log = (id: string, extra: Record<string, unknown> = {}): AtRec => ({
  id, fields: { Name: "Hills", RideId: "preset-hill-repeats-30", StartedAt: "2026-11-08T15:00:00.000Z", ElapsedSeconds: 1800, PlannedSeconds: 1800, SegmentsCompleted: 3, SegmentsTotal: 3, Kcal: 300, SegmentsJson: "[]", ...extra },
});
const song = (key: string, extra: Record<string, unknown> = {}): AtRec => ({ id: `rec${key}`, fields: { Key: key, Artist: "A", Title: "T", DurationSec: 200, Source: "deezer", Confirmed: false, FetchedAt: "2026-11-02T00:00:00.000Z", ...extra } });
const settings: AtRec = { id: "recSET", fields: { Name: SETTINGS_NAME, WorkoutJson: wj({ hiddenPresets: ["preset-a"] }) } };

describe("mapping rows", () => {
  it("a ride keeps its Airtable id, drops the id inside the JSON, and parses the JSON", () => {
    const m = mapRide(ride("recRIDE000000001", "Mine"));
    if ("skip" in m) throw new Error(m.skip);
    expect(m.row).toMatchObject({ id: "recRIDE000000001", name: "Mine", genre: "Rock", vibe: null, playlist_url: "https://p.example/1", total_seconds: 600, updated_at: "2026-11-01T10:00:00.000Z" });
    expect(m.row.workout).not.toHaveProperty("id");
    expect(m.row.workout).toHaveProperty("schemaVersion", 2);
  });
  it("accepts JSON that is already parsed (a backup file) and skips junk with a reason, never its contents", () => {
    expect("row" in mapRide({ id: "r", fields: { Name: "x", WorkoutJson: { schemaVersion: 2, segments: [] } } })).toBe(true);
    expect(mapRide({ id: "r", fields: { Name: "x", WorkoutJson: "{not json" } })).toEqual({ skip: "WorkoutJson is not valid JSON" });
    expect(mapRide({ id: "r", fields: { Name: "x" } })).toEqual({ skip: "no ride JSON" });
    expect(mapRide({ id: "r", fields: { WorkoutJson: wj({ segments: [] }) } })).toEqual({ skip: "no name" });
  });
  it("a log maps field by field; a snapshot that will not parse just becomes an empty chart", () => {
    const m = mapLog(log("recLOG000000001", { Notes: "good", EndedEarly: true, RideSeconds: 1700, StretchSeconds: 100, SegmentsJson: "{oops" }));
    if ("skip" in m) throw new Error(m.skip);
    expect(m.row).toMatchObject({ id: "recLOG000000001", ride_id: "preset-hill-repeats-30", started_at: "2026-11-08T15:00:00.000Z", kcal: 300, notes: "good", ended_early: true, ride_seconds: 1700, stretch_seconds: 100, segments: [] });
    expect(mapLog(log("x", { StartedAt: "garbage" }))).toEqual({ skip: "no valid StartedAt" });
  });
  it("a song maps; one with no length is skipped", () => {
    const m = mapSong(song("a|b", { Source: "typed", Confirmed: true, Album: "Alb" }));
    if ("skip" in m) throw new Error(m.skip);
    expect(m.row).toMatchObject({ key: "a|b", duration_sec: 200, source: "typed", confirmed: true, album: "Alb" });
    expect(mapSong(song("c|d", { DurationSec: 0 }))).toEqual({ skip: "no DurationSec" });
  });
  it("settings read the hidden starter rides", () => {
    expect(mapSettings(settings)).toEqual({ hiddenPresets: ["preset-a"] });
    expect(mapSettings(undefined)).toBeNull();
    expect(mapSettings({ id: "x", fields: { WorkoutJson: "{bad" } })).toBeNull();
  });
});

describe("what goes where", () => {
  const src = {
    rides: [ride("recA", "A"), ride("recB", "B"), settings],
    ridesV2: [ride("recV2A", "Preview test"), ride("recA", "dup of A")],
    logs: [log("recL1"), log("recL2")],
    songs: [song("a|b"), song("c|d")],
  };
  it("preview: production rides plus RidesV2, songs and settings, and no history", () => {
    const p = buildPlan("preview", src);
    expect(p.rides.map((r) => r.id)).toEqual(["recA", "recB", "recV2A"]); // settings row is not a ride; the duplicate id is kept once
    expect(p.logs).toEqual([]);
    expect(p.songs).toHaveLength(2);
    expect(p.settings).toEqual({ hiddenPresets: ["preset-a"] });
  });
  it("public: rides, history, songs and settings, and not RidesV2", () => {
    const p = buildPlan("public", src);
    expect(p.rides.map((r) => r.id)).toEqual(["recA", "recB"]);
    expect(p.logs.map((l) => l.id)).toEqual(["recL1", "recL2"]);
    expect(p.settings).not.toBeNull();
  });
  it("reports what it could not map, by id and reason only", () => {
    const p = buildPlan("public", { ...src, rides: [...src.rides, { id: "recBAD", fields: { Name: "Bad", WorkoutJson: "{x" } }] });
    expect(p.skipped).toEqual([{ table: "Rides", id: "recBAD", reason: "WorkoutJson is not valid JSON" }]);
  });
  it("a local backup file maps to the same shapes", () => {
    const recs = recsFromBackup([{ id: "recA", createdTime: "x", Name: "A", WorkoutJson: { ...PRESETS_V2[0], id: "n" } }, { nope: true }]);
    expect(recs).toHaveLength(1);
    expect(recs[0].fields).not.toHaveProperty("id");
    expect(buildPlan("public", { rides: recs, ridesV2: [], logs: [], songs: [] }).rides).toHaveLength(1);
  });
});
