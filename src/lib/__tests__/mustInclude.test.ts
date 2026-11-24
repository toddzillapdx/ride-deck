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

// ---- the two ways a typed song used to disappear -----------------------------------------------------------------------------
import { chooseMatch, titlesClose, type Candidate } from "../songs/match";
import { arrangeDraft, newSong, type RideDraft, type SongDraft } from "../builderV2";

const cand = (title: string, artist: string, o: Partial<Candidate> = {}): Candidate => ({ id: `${artist}|${title}`, title, artist, album: "The Chronic", durationSec: 238, rank: 900_000, ...o });

describe("a typed title that is not spelled like the record", () => {
  const catalog = [cand("Nuthin' But A 'G' Thang", "Dr. Dre"), cand("Nuthin' But A \"G\" Thang (Instrumental)", "Dr. Dre", { album: "Instrumentals" }), cand("Still D.R.E.", "Dr. Dre", { album: "2001" })];
  it("without the typed flag it is still missing (nothing changes for planner songs)", () => {
    expect(chooseMatch({ artist: "Dr Dre", title: "Nothing but a g thang" }, catalog).status).toBe("missing");
  });
  it("with it, the closest title by that artist is offered to confirm, not picked silently", () => {
    const m = chooseMatch({ artist: "Dr Dre", title: "Nothing but a g thang" }, catalog, { loose: true });
    expect(m.status).toBe("doubtful");
    expect(m.chosen?.title).toBe("Nuthin' But A 'G' Thang");
    expect(m.reason).toBe(`Did you mean "Nuthin' But A 'G' Thang"?`);
    expect(m.candidates.map((c) => c.title)).not.toContain("Nuthin' But A \"G\" Thang (Instrumental)"); // a bad version is never offered
  });
  it("the loose flag on the query works too (that is how the lookup passes it)", () => {
    expect(chooseMatch({ artist: "Dr Dre", title: "Nothing but a g thang", loose: true }, catalog).status).toBe("doubtful");
  });
  it("a different song by the same artist, or the same title by another artist, is still not a match", () => {
    expect(chooseMatch({ artist: "Dr Dre", title: "Forgot About Dre", loose: true }, catalog).status).toBe("missing");
    expect(chooseMatch({ artist: "Snoop Dogg", title: "Nothing but a g thang", loose: true }, catalog).status).toBe("missing");
  });
  it("an exact title is unaffected: it is ok, not doubtful", () => {
    expect(chooseMatch({ artist: "Snoop Dog", title: "Gin and Juice", loose: true }, [cand("Gin And Juice", "Snoop Dogg", { album: "Doggystyle" })]).status).toBe("ok");
  });
  it("short titles must be nearly exact", () => {
    expect(titlesClose("Help", "Hell")).toBe(false);
    expect(titlesClose("Run", "Rum")).toBe(false);
    expect(titlesClose("Nothing but a g thang", "Nuthin' But A 'G' Thang")).toBe(true);
    expect(titlesClose("Bohemian Rhapsody", "Another One Bites the Dust")).toBe(false);
  });
});

describe("a song you asked for never disappears into Held back", () => {
  const song = (title: string, sec: number | undefined, o: Partial<SongDraft> = {}): SongDraft => ({ ...newSong({ title, artist: "A", intensity: 5 }), durationSec: sec, status: sec ? "ok" : "missing", ...o });
  const draftWith = (extra: SongDraft): RideDraft => ({
    ...emptyDraft(), targetMin: 20,
    songs: [song("Warm", 180, { intensity: 1 }), ...Array.from({ length: 5 }, (_, i) => song(`Mid ${i}`, 200)), extra, song("Cool", 200, { intensity: 2 })].map((s, i) => ({ ...s, pos: i })),
  });
  it("a must-include song with no length stays on the list, flagged, and is not benched", () => {
    const d = draftWith(song("Nothing but a g thang", undefined, { locked: true, must: true }));
    const { draft } = arrangeDraft(d);
    expect(draft.songs.map((s) => s.title)).toContain("Nothing but a g thang");
    expect(draft.bench.map((s) => s.title)).not.toContain("Nothing but a g thang");
    expect(draft.songs[0].title).toBe("Warm");
    expect(draft.songs[draft.songs.length - 1].title).toBe("Cool");
  });
  it("it sits in the middle, near where the planner put it", () => {
    const { draft } = arrangeDraft(draftWith(song("Typed", undefined, { locked: true, must: true })));
    const i = draft.songs.findIndex((s) => s.title === "Typed");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(draft.songs.length - 1);
  });
  it("an ordinary song with no length still goes to Held back, as before", () => {
    const { draft } = arrangeDraft(draftWith(song("Plain", undefined)));
    expect(draft.bench.map((s) => s.title)).toContain("Plain");
    expect(draft.songs.map((s) => s.title)).not.toContain("Plain");
  });
  it("and it keeps blocking the save until it has a length (the existing rule)", async () => {
    const { soundtrackProblems } = await import("../songFlow");
    const { checkSongs } = await import("../songFlow");
    const { draft } = arrangeDraft(draftWith(song("Typed", undefined, { locked: true, must: true })));
    const problems = soundtrackProblems({ name: "x", songs: draft.songs, targetMin: 20, check: checkSongs(draft.songs, 20) });
    expect(problems.join(" | ")).toMatch(/needs a length/);
  });
});
