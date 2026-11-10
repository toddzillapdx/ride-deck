import { describe, expect, it, afterEach } from "vitest";
import { FakeDb } from "../db/__tests__/fakeDb";
import {
  NotFound, createLog, createRide, createRideV2, deleteLog, deleteRide, getRide, getRideRaw, getSettings, isV2, listLogs, listRides, logPatchToRow, logToRow,
  parseSettings, patchRideMeta, putSettings, rideToRow, rowToLog, rowToRaw, rowToWorkout, updateLog, updateRide, updateRideV2, workoutToRow, dbSchema, dbConfigured,
} from "../db";
import { cleanUrl } from "../db/client";
import { readCache, writeCache, rowToSong, songToRow } from "../songs/cache";
import { PRESETS } from "../presets";
import { PRESETS_V2 } from "../presetsV2";
import { readRide, rideDuration, type Ride } from "../engine";
import { parseLogInput } from "../history";

const v2: Ride = {
  schemaVersion: 2, id: "", sourceId: "recOLD", name: "X", genre: "Rock",
  segments: [
    { type: "flat", role: "warmup", name: "W", durationSec: 60, cadence: [70, 80], effort: [2, 3], cue: "" },
    { type: "interval", name: "S", workKind: "sprint", ratio: "1:1", workSec: 30, restSec: 30, rounds: 2, work: { cadence: [110, 120], effort: [4, 6] }, rest: { cadence: [70, 80], effort: [2, 3] }, cue: "" },
    { type: "hill", name: "H", durationSec: 120, cadence: [60, 70], effortFrom: 4, effortTo: 6, cue: "" },
  ],
  tracklist: [{ segmentIndex: 0, title: "t", artist: "a", durationSec: 200 }],
};
const v1 = PRESETS[0];
const fake = () => new FakeDb();
const withRow = (db: FakeDb, id: string, extra: Record<string, unknown> = {}, ride: Ride = v2) => db.seed("rides", [{ id, ...rideToRow(ride), ...extra }]);

describe("row converters", () => {
  it("never store the id inside the JSON, and fill the browse columns", () => {
    const r = rideToRow({ ...v2, id: "abc" });
    expect(r.workout).not.toHaveProperty("id");
    expect(r).toMatchObject({ name: "X", genre: "Rock", total_seconds: rideDuration(v2), playlist_url: null });
    const w = workoutToRow({ ...v1, id: "zzz" });
    expect(w.workout).not.toHaveProperty("id");
    expect(typeof w.updated_at).toBe("string");
  });

  it("a v2 row loads for the v1-shaped library with the right total and keeps its id", () => {
    const w = rowToWorkout({ id: "rec1", ...rideToRow(v2) });
    expect(w.id).toBe("rec1");
    expect(w.segments.reduce((t, s) => t + s.durationSec, 0)).toBe(rideDuration(readRide(v2).ride));
    expect(w.tracklist?.[0].durationSec).toBe(200);
  });

  it("sourceId survives a strict re-read", () => {
    expect(readRide(rowToRaw({ id: "r", ...rideToRow(v2) })).ride.sourceId).toBe("recOLD");
  });

  it("the name and playlist columns win over the JSON", () => {
    const row = { id: "r", ...rideToRow({ ...v2, playlistUrl: "https://a.example/x" }), name: "Renamed", playlist_url: "https://b.example/y" };
    const w = rowToWorkout(row);
    expect(w.name).toBe("Renamed");
    expect(w.playlistUrl).toBe("https://b.example/y");
    const raw = rowToRaw(row);
    expect(raw).toMatchObject({ name: "Renamed", playlistUrl: "https://b.example/y", id: "r" });
    // an empty playlist column clears it; a null column leaves the JSON alone
    expect(rowToWorkout({ ...row, playlist_url: "" }).playlistUrl).toBeUndefined();
    expect(rowToWorkout({ ...row, playlist_url: null }).playlistUrl).toBe("https://a.example/x");
  });

  it("accepts the JSON as an object or as a string (old exports)", () => {
    const row = { id: "r", ...rideToRow(v2) };
    expect(rowToWorkout({ ...row, workout: JSON.stringify(row.workout) }).name).toBe("X");
  });
});

describe("rides", () => {
  it("lists newest first, hides an original that has a converted copy, and reports unreadable rows", async () => {
    const db = fake();
    withRow(db, "old1", { updated_at: "2026-01-01T00:00:00Z" });
    db.seed("rides", [{ id: "orig", ...rideToRow({ ...v2, name: "Original" }), updated_at: "2026-02-01T00:00:00Z" }]);
    db.seed("rides", [{ id: "copy", ...rideToRow({ ...v2, name: "Copy", sourceId: "orig" }), updated_at: "2026-03-01T00:00:00Z" }]);
    db.seed("rides", [{ id: "broken", name: "Bad", workout: { nonsense: true }, updated_at: "2026-04-01T00:00:00Z" }]);
    const { rides, skipped } = await listRides(db.asClient());
    expect(rides.map((r) => r.id)).toEqual(["copy", "old1"]);
    expect(skipped).toEqual(["broken"]);
    expect(db.calls).toEqual(["select rides"]); // one query, no per-ride calls
  });

  it("get, raw and isV2 find the row, apply overrides, and say NotFound when missing", async () => {
    const db = fake();
    withRow(db, "r1", { name: "Edited" });
    db.seed("rides", [{ id: "r2", ...workoutToRow(v1) }]);
    expect((await getRide("r1", db.asClient())).name).toBe("Edited");
    expect((await getRideRaw("r1", db.asClient())).id).toBe("r1");
    expect(await isV2("r1", db.asClient())).toBe(true);
    expect(await isV2("r2", db.asClient())).toBe(false);
    await expect(getRide("nope", db.asClient())).rejects.toBeInstanceOf(NotFound);
  });

  it("create returns the new row with an id; update changes it and bumps updated_at; unknown ids are NotFound", async () => {
    const db = fake();
    const made = await createRideV2(v2, db.asClient());
    expect(made.id).toMatch(/^0000/);
    const before = db.table("rides")[0].updated_at;
    await new Promise((r) => setTimeout(r, 5));
    const next = { ...v2, name: "Y" };
    expect((await updateRideV2(made.id, next, db.asClient())).name).toBe("Y");
    expect(db.table("rides")[0].updated_at).not.toBe(before);
    await expect(updateRideV2("missing", next, db.asClient())).rejects.toBeInstanceOf(NotFound);
    const old = await createRide(v1, db.asClient());
    expect((await updateRide(old.id, { ...v1, name: "Z" }, db.asClient())).name).toBe("Z");
    await deleteRide(made.id, db.asClient());
    expect(db.table("rides")).toHaveLength(1);
    await expect(deleteRide(made.id, db.asClient())).rejects.toBeInstanceOf(NotFound);
  });

  it("a database error surfaces as an error, not as a NotFound", async () => {
    const db = fake(); db.failWith = "boom";
    await expect(listRides(db.asClient())).rejects.toThrow(/boom/);
    await expect(getRide("x", db.asClient())).rejects.not.toBeInstanceOf(NotFound);
  });

  it("patchRideMeta merges the music in place and leaves the segments alone", async () => {
    const db = fake();
    withRow(db, "r1");
    const out = await patchRideMeta("r1", { playlistUrl: "https://p.example/1", tracklist: [{ segmentIndex: 1, title: "n", artist: "m", durationSec: 111 }], vibe: "Classic" }, db.asClient());
    expect(out.id).toBe("r1");
    const stored = db.table("rides")[0];
    expect(db.table("rides")).toHaveLength(1);
    expect(stored.playlist_url).toBe("https://p.example/1");
    const w = stored.workout as Ride;
    expect(w.segments).toEqual(v2.segments);
    expect(w.sourceId).toBe("recOLD");
    expect(w.tracklist?.[0].title).toBe("n");
  });

  it("patchRideMeta converts a stored v1 ride in place (same id, no copy)", async () => {
    const db = fake();
    db.seed("rides", [{ id: "oldv1", ...workoutToRow(v1) }]);
    await patchRideMeta("oldv1", { playlistUrl: "https://p.example/2" }, db.asClient());
    expect(db.table("rides")).toHaveLength(1);
    expect(db.table("rides")[0].id).toBe("oldv1");
    expect((db.table("rides")[0].workout as { schemaVersion?: number }).schemaVersion).toBe(2);
    await expect(patchRideMeta("ghost", {}, db.asClient())).rejects.toBeInstanceOf(NotFound);
  });

  it("every starter ride survives the row round trip", () => {
    for (const p of PRESETS_V2) {
      const w = rowToWorkout({ id: p.id, ...rideToRow(p) });
      expect(w.segments.length).toBeGreaterThan(0);
    }
  });
});

describe("history rows", () => {
  const input = parseLogInput({
    rideName: "Hills", rideId: "preset-hill-repeats-30", startedAt: "2026-11-08T15:00:00.000Z", elapsedSec: 1800, plannedSec: 1800, segmentsCompleted: 1, segmentsTotal: 1,
    kcal: 310, notes: "felt good", endedEarly: true, rideSec: 1700, stretchSec: 100,
    segments: [{ name: "W", type: "warmup", durationSec: 60, cadence: [70, 80], effort: [2, 3] }],
  });

  it("a log round-trips and the timestamp comes back as an ISO Z string", () => {
    const row = { id: "L1", ...logToRow(input), started_at: "2026-11-08T15:00:00+00:00" };
    const log = rowToLog(row);
    expect(log).toMatchObject({ id: "L1", rideId: "preset-hill-repeats-30", rideName: "Hills", startedAt: "2026-11-08T15:00:00.000Z", elapsedSec: 1800, kcal: 310, notes: "felt good", endedEarly: true, rideSec: 1700, stretchSec: 100 });
    expect(log.segments).toHaveLength(1);
  });

  it("numeric kcal that arrives as a string is read as a number; a missing one stays missing", () => {
    expect(rowToLog({ id: "a", started_at: "2026-01-01T00:00:00Z", kcal: "312.5" }).kcal).toBe(312.5);
    expect(rowToLog({ id: "a", started_at: "2026-01-01T00:00:00Z", kcal: null })).not.toHaveProperty("kcal");
  });

  it("creates, lists newest first, patches, and deletes", async () => {
    const db = fake();
    const a = await createLog({ ...input, startedAt: "2026-11-01T10:00:00.000Z" }, db.asClient());
    const b = await createLog({ ...input, startedAt: "2026-11-05T10:00:00.000Z" }, db.asClient());
    expect((await listLogs(db.asClient())).map((l) => l.id)).toEqual([b.id, a.id]);
    expect((await updateLog(a.id, { kcal: 500 }, db.asClient())).kcal).toBe(500);
    await deleteLog(a.id, db.asClient());
    await expect(deleteLog(a.id, db.asClient())).rejects.toBeInstanceOf(NotFound);
    await expect(updateLog("nope", { kcal: 1 }, db.asClient())).rejects.toBeInstanceOf(NotFound);
  });

  it("patch semantics: only what is provided changes; null clears kcal; null or empty clears notes", async () => {
    expect(logPatchToRow({ kcal: 400 })).toEqual({ kcal: 400 });
    expect(logPatchToRow({ kcal: null })).toEqual({ kcal: null });
    expect(logPatchToRow({ notes: null })).toEqual({ notes: null });
    expect(logPatchToRow({ notes: "" })).toEqual({ notes: null });
    expect(logPatchToRow({ elapsedSec: 5, stretchSec: 6 })).toEqual({ elapsed_sec: 5, stretch_seconds: 6 });
    const db = fake();
    const a = await createLog(input, db.asClient());
    const cleared = await updateLog(a.id, { kcal: null, notes: null }, db.asClient());
    expect(cleared).not.toHaveProperty("kcal");
    expect(cleared).not.toHaveProperty("notes");
    expect(cleared.elapsedSec).toBe(1800); // untouched
    // an empty patch just reads the row
    expect((await updateLog(a.id, {}, db.asClient())).id).toBe(a.id);
  });
});

describe("settings", () => {
  it("defaults to nothing hidden and saves with one upsert", async () => {
    const db = fake();
    expect(await getSettings(db.asClient())).toEqual({ hiddenPresets: [] });
    await putSettings({ hiddenPresets: ["preset-a"] }, db.asClient());
    await putSettings({ hiddenPresets: ["preset-a", "preset-b"] }, db.asClient());
    expect(db.table("app_settings")).toHaveLength(1);
    expect(await getSettings(db.asClient())).toEqual({ hiddenPresets: ["preset-a", "preset-b"] });
    expect(db.calls.filter((c) => c === "upsert app_settings")).toHaveLength(2);
  });
  it("ignores junk", () => {
    expect(parseSettings({ hiddenPresets: ["a", 3, null] })).toEqual({ hiddenPresets: ["a"] });
    expect(parseSettings("not json")).toEqual({ hiddenPresets: [] });
    expect(parseSettings(null)).toEqual({ hiddenPresets: [] });
  });
});

describe("song cache", () => {
  const song = { key: "a|b", artist: "A", title: "B", durationSec: 200, source: "deezer" as const, album: "Alb", deezerId: "9", confirmed: false };
  it("reads many songs in one query and writes one with one upsert", async () => {
    const db = fake();
    expect(await writeCache(song, db.asClient())).toBe(true);
    expect(await writeCache({ ...song, durationSec: 210, confirmed: true }, db.asClient())).toBe(true);
    expect(db.table("songs")).toHaveLength(1);
    const got = await readCache(["a|b", "c|d"], db.asClient());
    expect(got.get("a|b")).toMatchObject({ durationSec: 210, confirmed: true, album: "Alb" });
    expect(db.calls).toEqual(["upsert songs", "upsert songs", "select songs"]);
  });
  it("never throws: a failing database gives an empty cache and false", async () => {
    const db = fake(); db.failWith = "down";
    expect((await readCache(["a|b"], db.asClient())).size).toBe(0);
    expect(await writeCache(song, db.asClient())).toBe(false);
  });
  it("without Supabase configured it quietly does nothing", async () => {
    expect((await readCache(["a|b"])).size).toBe(0);
    expect(await writeCache(song)).toBe(false);
  });
  it("converts rows both ways and rejects a row with no length", () => {
    expect(rowToSong(songToRow(song))).toMatchObject({ key: "a|b", durationSec: 200, source: "deezer" });
    expect(rowToSong({ key: "x", duration_sec: 0 })).toBeNull();
    expect(rowToSong({ key: "x", duration_sec: 100, source: "typed" })?.source).toBe("typed");
  });
});

describe("project url", () => {
  it("keeps just the address, whatever was pasted", () => {
    expect(cleanUrl("https://abc.supabase.co")).toBe("https://abc.supabase.co");
    expect(cleanUrl("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(cleanUrl("  https://abc.supabase.co/  ")).toBe("https://abc.supabase.co");
    expect(cleanUrl("not a url")).toBe("not a url");
  });
});

describe("schema choice", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  it("is public unless SUPABASE_DB_SCHEMA says otherwise", () => {
    delete process.env.SUPABASE_DB_SCHEMA;
    expect(dbSchema()).toBe("public");
    process.env.SUPABASE_DB_SCHEMA = "preview";
    expect(dbSchema()).toBe("preview");
    process.env.SUPABASE_DB_SCHEMA = "  ";
    expect(dbSchema()).toBe("public");
  });
  it("needs both the URL and the key", () => {
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY;
    expect(dbConfigured()).toBe(false);
    process.env.SUPABASE_URL = "https://x.supabase.co";
    expect(dbConfigured()).toBe(false);
    process.env.SUPABASE_SECRET_KEY = "k";
    expect(dbConfigured()).toBe(true);
  });
  it("two schemas never see each other's rows", async () => {
    const prod = new FakeDb("public"), prev = new FakeDb("preview");
    await createRideV2({ ...v2, name: "Prod ride" }, prod.asClient());
    expect((await listRides(prev.asClient())).rides).toHaveLength(0);
    expect((await listRides(prod.asClient())).rides).toHaveLength(1);
  });
});
