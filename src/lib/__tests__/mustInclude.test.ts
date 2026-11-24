import { describe, expect, it } from "vitest";
import { MAX_MUST, ensureMusts, mustNote, parseMust, sameSong, type PlanSong } from "../mustInclude";
import { buildSongMessage } from "../songPlanner";
import { emptyDraft, setPlanned } from "../builderV2";

const planned = (title: string, artist: string, intensity = 5, extra: { spare?: boolean } = {}): PlanSong => ({ title, artist, intensity, ...extra });

describe("reading the Must include box", () => {
  it("takes Artist - Song, one per line, with hyphens or dashes", () => {
    const r = parseMust("Led Zeppelin - Bron-Yr-Aur\nDavid Bowie – The Jean Genie\nQueen — Under Pressure");
    expect(r.bad).toEqual([]);
    expect(r.songs).toEqual([
      { artist: "Led Zeppelin", title: "Bron-Yr-Aur" },
      { artist: "David Bowie", title: "The Jean Genie" },
      { artist: "Queen", title: "Under Pressure" },
    ]);
  });
  it("takes 'Song by Artist' too, and semicolons", () => {
    expect(parseMust("Let's Dance by David Bowie; Heroes by David Bowie").songs).toEqual([
      { artist: "David Bowie", title: "Let's Dance" }, { artist: "David Bowie", title: "Heroes" },
    ]);
  });
  it("splits at the first spaced dash, so a hyphen inside a name is safe", () => {
    expect(parseMust("Jay-Z - Run This Town").songs).toEqual([{ artist: "Jay-Z", title: "Run This Town" }]);
    expect(parseMust("AC/DC - Back In Black").songs).toEqual([{ artist: "AC/DC", title: "Back In Black" }]);
  });
  it("hands back lines it cannot read, so the screen can say which", () => {
    const r = parseMust("Bron-Yr-Aur\nLed Zeppelin - Kashmir\n   \n-");
    expect(r.songs).toEqual([{ artist: "Led Zeppelin", title: "Kashmir" }]);
    expect(r.bad).toEqual(["Bron-Yr-Aur", "-"]);
  });
  it("ignores blank lines and repeats (even a remastered repeat)", () => {
    const r = parseMust("\nQueen - Radio Ga Ga\n\nqueen - radio ga ga (Remastered 2011)\n");
    expect(r.songs).toHaveLength(1);
  });
  it("allows up to the limit and reports the rest", () => {
    const text = Array.from({ length: MAX_MUST + 2 }, (_, i) => `Artist ${i} - Song ${i}`).join("\n");
    const r = parseMust(text);
    expect(r.songs).toHaveLength(MAX_MUST);
    expect(r.bad).toHaveLength(2);
    expect(r.bad[0]).toMatch(/more than 8/);
  });
  it("an empty box is fine", () => {
    expect(parseMust("")).toEqual({ songs: [], bad: [] });
  });
});

describe("a typed song always ends up on the list", () => {
  const list = [planned("Warm", "A", 3), planned("Mid 1", "B", 6), planned("Mid 2", "C", 8), planned("Mid 3", "D", 7), planned("Cool", "E", 2)];

  it("a song the planner already returned stays where it was, locked in as a must", () => {
    const r = ensureMusts([...list.slice(0, 2), planned("Bron-Yr-Aur (Remastered 2014)", "Led Zeppelin", 4), ...list.slice(2)], [{ artist: "Led Zeppelin", title: "Bron-Yr-Aur" }]);
    expect(r.added).toEqual([]);
    expect(r.songs.map((s) => s.title)).toEqual(["Warm", "Mid 1", "Bron-Yr-Aur", "Mid 2", "Mid 3", "Cool"]); // the typed spelling replaces the planner's
    expect(r.songs[2]).toMatchObject({ must: true, artist: "Led Zeppelin", intensity: 4 });
  });
  it("a must song the planner marked as a spare is no longer a spare", () => {
    const r = ensureMusts([...list, planned("Kashmir", "Led Zeppelin", 7, { spare: true })], [{ artist: "Led Zeppelin", title: "Kashmir" }]);
    const k = r.songs.find((s) => s.title === "Kashmir")!;
    expect(k.must).toBe(true);
    expect(k).not.toHaveProperty("spare");
  });
  it("a song the planner left out is added in the middle, never first or last", () => {
    const r = ensureMusts(list, [{ artist: "Queen", title: "Under Pressure" }]);
    expect(r.added).toEqual([{ artist: "Queen", title: "Under Pressure" }]);
    const i = r.songs.findIndex((s) => s.title === "Under Pressure");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(r.songs.length - 1);
    expect(r.songs[i]).toMatchObject({ must: true, intensity: 5 });
    expect(r.songs[0].title).toBe("Warm");
    expect(r.songs[r.songs.length - 1].title).toBe("Cool");
  });
  it("several missing songs are spread through the middle, in the order typed", () => {
    const r = ensureMusts(list, [{ artist: "X", title: "One" }, { artist: "Y", title: "Two" }, { artist: "Z", title: "Three" }]);
    const titles = r.songs.map((s) => s.title);
    expect(r.songs).toHaveLength(8);
    expect(titles.indexOf("One")).toBeLessThan(titles.indexOf("Two"));
    expect(titles.indexOf("Two")).toBeLessThan(titles.indexOf("Three"));
    expect(titles[0]).toBe("Warm");
    expect(titles[titles.length - 1]).toBe("Cool");
  });
  it("works on a tiny or empty list", () => {
    expect(ensureMusts([] as PlanSong[], [{ artist: "Q", title: "S" }]).songs.map((s) => s.title)).toEqual(["S"]);
    expect(ensureMusts([planned("a", "A"), planned("b", "B")], [{ artist: "Q", title: "S" }]).songs).toHaveLength(3);
  });
  it("with nothing typed the list is unchanged", () => {
    const r = ensureMusts(list, []);
    expect(r.songs).toEqual(list);
    expect(r.found).toEqual([]);
    expect(r.added).toEqual([]);
  });
  it("matches the same song across spellings, but not a different song by the same artist", () => {
    expect(sameSong({ artist: "The Beatles", title: "Help!" }, { artist: "Beatles", title: "Help! (Remastered 2009)" })).toBe(true);
    expect(sameSong({ artist: "Queen", title: "Radio Ga Ga" }, { artist: "Queen", title: "Under Pressure" })).toBe(false);
    expect(sameSong({ artist: "Queen", title: "Radio Ga Ga" }, { artist: "Bowie", title: "Radio Ga Ga" })).toBe(false);
  });
  it("says what happened in plain words", () => {
    expect(mustNote({ found: [], added: [] })).toBe("");
    expect(mustNote({ found: [{ artist: "a", title: "One" }], added: [] })).toBe("Your song is on the list.");
    expect(mustNote({ found: [{ artist: "a", title: "One" }], added: [{ artist: "b", title: "Two" }] })).toBe("Your 2 songs are on the list. Added: Two.");
  });
});

describe("the planner is told, and the draft locks the songs", () => {
  const base = { eras: [], genres: [], vibe: "Classic", seeds: "", artistOnly: false, targetMin: 30, count: 12, avoid: [], keep: [] };
  it("a plan request lists the songs that must be included", () => {
    const m = buildSongMessage({ ...base, must: [{ artist: "Led Zeppelin", title: "Bron-Yr-Aur" }] });
    expect(m).toContain("MUST INCLUDE: these 1 song must be in the list exactly as written");
    expect(m).toContain("- Led Zeppelin - Bron-Yr-Aur");
    expect(m).toContain("set spare false");
  });
  it("a plan without must-include songs has no such section, and a one-song swap never gets it", () => {
    expect(buildSongMessage(base)).not.toContain("MUST INCLUDE");
    expect(buildSongMessage({ ...base, count: 1, slot: { index: 3, total: 9 }, must: [{ artist: "Q", title: "S" }] })).not.toContain("MUST INCLUDE");
  });
  it("must songs are locked in the draft, so Fix length and swaps never drop them", () => {
    const d = setPlanned(emptyDraft(), [
      { title: "Warm", artist: "A", intensity: 3 }, { title: "Bron-Yr-Aur", artist: "Led Zeppelin", intensity: 4, must: true }, { title: "Cool", artist: "E", intensity: 2 },
    ]);
    expect(d.songs.map((s) => !!s.locked)).toEqual([false, true, false]);
  });
});
