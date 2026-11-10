import { describe, expect, it } from "vitest";
import { checkSongs, nextAdjustment, rideSeconds, rideTitle, songsNeeded, suggestSegments, windowFor } from "../songFlow";

const songs = (...d: number[]) => d.map((durationSec, i) => ({ title: `s${i}`, durationSec }));

describe("ride length", () => {
  it("is every song but the last, plus the 2:00 cool-down", () => {
    expect(rideSeconds([180, 240, 300, 400])).toBe(180 + 240 + 300 + 120);
    expect(rideSeconds([180, undefined, 300])).toBeUndefined();
    expect(rideSeconds([400])).toBe(120);
  });
  it("window is the target up to 2:00 over", () => {
    expect(windowFor(30)).toEqual({ minSec: 1800, maxSec: 1920 });
  });
  it("checks short, ok, long", () => {
    // 4 songs: 180 + 240 + 240 = 660 + 120 = 780 (13 min)
    expect(checkSongs(songs(180, 240, 240, 300), 13).state).toBe("ok");
    expect(checkSongs(songs(180, 240, 240, 300), 14).state).toBe("short");
    expect(checkSongs(songs(180, 240, 240, 300), 14).deltaSec).toBe(60);
    expect(checkSongs(songs(180, 240, 240, 300), 10).state).toBe("long");
  });
  it("flags a warm-up song outside 2:30-3:30 and a last song under 2:00", () => {
    expect(checkSongs(songs(120, 240, 300), 10).issues.map((i) => i.kind)).toContain("first-length");
    expect(checkSongs(songs(240, 240, 100), 10).issues.map((i) => i.kind)).toContain("last-short");
    expect(checkSongs(songs(180, 240, 200), 10).issues).toEqual([]);
  });
  it("reports a missing length", () => {
    const c = checkSongs([{ title: "a", durationSec: 180 }, { title: "b" }, { title: "c", durationSec: 200 }], 10);
    expect(c.state).toBe("unknown");
    expect(c.issues[0].kind).toBe("missing");
  });
});

describe("adjusting toward the window", () => {
  it("does nothing when the ride is in the window", () => {
    expect(nextAdjustment(songs(180, 240, 240, 300), 13).action).toBe("none");
  });
  it("asks for a longer middle song when slightly short", () => {
    const a = nextAdjustment(songs(180, 200, 240, 300), 13); // ride 700, needs 780
    expect(a.action).toBe("swap");
    if (a.action === "swap") { expect(a.index).toBe(1); expect(a.wantSec).toBeGreaterThan(200 + 80); }
  });
  it("adds a song before the last when far short", () => {
    const a = nextAdjustment(songs(180, 200, 300), 12); // ride 200+120=... 180+200+120=500, needs 720
    expect(a.action).toBe("add");
    if (a.action === "add") expect(a.before).toBe(2);
  });
  it("swaps for a shorter song when over, and never touches locked or end songs", () => {
    const list = [{ durationSec: 180 }, { durationSec: 400, locked: true }, { durationSec: 300 }, { durationSec: 250 }]; // 180+400+300+120 = 1000
    const a = nextAdjustment(list, 13); // window 780-900
    expect(a.action).toBe("swap");
    if (a.action === "swap") expect(a.index).toBe(2);
  });
  it("removes a song when no shorter replacement makes sense", () => {
    const a = nextAdjustment(songs(180, 200, 300), 4); // 180+200+120 = 500, window 240-360, over by 140
    expect(["remove", "swap"]).toContain(a.action);
  });
});

describe("naming, counts, suggestions", () => {
  it("rounds the title down to whole minutes", () => {
    expect(rideTitle("80s Hip Hop", 32 * 60 + 40)).toBe("80s Hip Hop ride - 32 min");
    expect(rideTitle("  ", 1799)).toBe("Ride ride - 29 min");
  });
  it("asks for enough songs", () => {
    expect(songsNeeded(30)).toBeGreaterThanOrEqual(9);
    expect(songsNeeded(20)).toBeLessThan(songsNeeded(45));
  });
  it("starts with warm-up, ends with cool-down, and maps intensity", () => {
    const s = suggestSegments([3, 5, 7, 9, 2, 9, 4]);
    expect(s[0]).toEqual({ kind: "flat", role: "warmup" });
    expect(s[6]).toEqual({ kind: "flat", role: "cooldown" });
    expect(s[1]).toEqual({ kind: "flat", role: "steady" });
    expect(s[2]).toEqual({ kind: "hill" });
    expect(s[3]).toEqual({ kind: "interval", work: "sprint" });
    expect(s[4]).toEqual({ kind: "flat", role: "recover" });
    expect(s[5]).toEqual({ kind: "interval", work: "resistance" });
  });
});

import { arrange, soundtrackProblems, type PoolSong } from "../songFlow";
const P = (title: string, durationSec: number | undefined, intensity: number, over: Partial<PoolSong> = {}): PoolSong => ({ title, durationSec, intensity, ...over });

describe("arrange", () => {
  it("opens with the easy 2:30-3:30 song wherever it sat, and moves the calmest long song last", () => {
    const pool = [
      P("Wild Horses", 340, 3), P("Groove", 220, 5), P("Climb", 300, 7), P("Sprint", 230, 9),
      P("Start Me Up", 205, 3), P("Mellow", 260, 2), P("Push", 250, 8), P("Cheer", 200, 6),
    ];
    const a = arrange(pool, 20); // window 20:00-22:00
    expect(a.songs[0].title).toBe("Start Me Up");
    expect(a.songs[a.songs.length - 1].title).toBe("Mellow");
    expect(a.check.state).toBe("ok");
    expect(a.check.rideSec).toBeGreaterThanOrEqual(1200);
    expect(a.check.rideSec).toBeLessThanOrEqual(1320);
    // the middle keeps the planner's order
    const mid = a.songs.slice(1, -1).map((s) => s.title);
    const order = pool.map((s) => s.title);
    expect(mid).toEqual([...mid].sort((x, y) => order.indexOf(x) - order.indexOf(y)));
  });

  it("accepts a warm-up a few seconds over 3:30 when nothing is inside the range", () => {
    const a = arrange([P("Start Me Up", 211, 3), P("B", 240, 5), P("C", 250, 6), P("D", 130, 2)], 10);
    expect(a.songs[0].title).toBe("Start Me Up");
    expect(checkSongs(songs(211, 240, 300), 8).issues.filter((i) => i.kind === "first-length")).toEqual([]);
  });

  it("leaves out songs with no length and drops spares first", () => {
    const pool = [P("A", 180, 3), P("B", 240, 5), P("C", undefined, 6), P("D", 240, 7, { spare: true }), P("E", 240, 8), P("F", 240, 9), P("G", 200, 2)];
    const a = arrange(pool, 12); // 12:00-14:00; base 180+120 -> middle needs 420..540
    expect(a.songs.map((s) => s.title)).not.toContain("C");
    expect(a.bench.map((s) => s.title)).toContain("C");
    expect(a.check.state).toBe("ok");
    expect(a.songs.map((s) => s.title)).not.toContain("D"); // the spare goes before a real song
  });

  it("never lands short when it can land over, and says so when nothing fits the window", () => {
    const pool = [P("A", 180, 3), P("B", 300, 5), P("C", 300, 6), P("D", 200, 2)];
    const a = arrange(pool, 60);
    expect(a.ok).toBe(false);
    expect(a.problem).toBe("window");
    expect(a.check.state).toBe("short"); // all songs kept
    expect(a.songs.length).toBe(4);
  });

  it("reports when no song can be the warm-up or the cool-down", () => {
    expect(arrange([P("A", 340, 3), P("B", 330, 4), P("C", 320, 5)], 10).problem).toBe("no-warmup");
    expect(arrange([P("A", 180, 3), P("B", 100, 4)], 10).problem).toBe("no-cooldown");
  });

  it("keeps locked songs", () => {
    const pool = [P("A", 180, 3), P("B", 240, 5, { locked: true, spare: true }), P("C", 240, 6), P("D", 240, 7), P("E", 240, 2)];
    const a = arrange(pool, 12); // middle needs 420..540: two of B,C,D
    expect(a.songs.map((s) => s.title)).toContain("B");
  });
});

describe("what blocks saving the soundtrack", () => {
  const ok = checkSongs(songs(180, 240, 240, 300), 13);
  it("is empty when everything is in order", () => {
    expect(soundtrackProblems({ name: "x", songs: songs(180, 240, 240, 300), targetMin: 13, check: ok })).toEqual([]);
  });
  it("lists every problem in plain words", () => {
    const list = songs(340, 240, 240, 100) as PoolSong[];
    list[1] = { ...list[1], status: "doubtful" };
    const c = checkSongs(list, 20);
    const p = soundtrackProblems({ name: " ", songs: list, targetMin: 20, check: c });
    expect(p.join(" | ")).toMatch(/Name the playlist/);
    expect(p.join(" | ")).toMatch(/Confirm 1 version/);
    expect(p.join(" | ")).toMatch(/warm-up song is 5:40/);
    expect(p.join(" | ")).toMatch(/last song is 1:40/);
    expect(p.join(" | ")).toMatch(/short of 20 min/);
  });
});

describe("locked songs stay even when the target cannot be met", () => {
  it("keeps a locked song in the fallback too", () => {
    const pool = [P("A", 180, 3), P("B", 240, 5, { locked: true }), P("C", 240, 6), P("D", 240, 7), P("E", 200, 2)];
    const a = arrange(pool, 5); // far too short a target: everything wants to go
    expect(a.songs.map((s) => s.title)).toContain("B");
    expect(a.problem).toBe("window");
  });
});
