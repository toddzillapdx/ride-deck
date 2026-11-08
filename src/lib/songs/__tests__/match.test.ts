import { describe, expect, it } from "vitest";
import { badVersion, baseTitle, chooseMatch, songKey, type Candidate } from "../match";

const c = (title: string, artist: string, album: string, durationSec: number, rank: number, id = `${title}${durationSec}`): Candidate => ({ id, title, artist, album, durationSec, rank });

describe("keys and titles", () => {
  it("strips version noise", () => {
    expect(baseTitle("Rapture (Remastered 2001)")).toBe("Rapture");
    expect(baseTitle("Walk This Way (feat. Aerosmith)")).toBe("Walk This Way");
    expect(baseTitle("Dreams - 2004 Remaster")).toBe("Dreams");
  });
  it("keys ignore case, punctuation and accents", () => {
    expect(songKey({ artist: "Run-DMC", title: "Walk This Way" })).toBe(songKey({ artist: "RUN DMC", title: "walk this way (feat. Aerosmith)" }));
    expect(songKey({ artist: "Dead Kennedys", title: "California Uber Alles" })).toBe(songKey({ artist: "Dead Kennedys", title: "California Über Alles" }));
  });
});

describe("bad versions", () => {
  it("skips live, demo, instrumental, tribute", () => {
    expect(badVersion({ title: "Walk This Way (Demo)", album: "x" }, "Walk This Way")).toBe(true);
    expect(badVersion({ title: "Walk This Way (Instrumental)", album: "x" }, "Walk This Way")).toBe(true);
    expect(badVersion({ title: "Rapture (Live from Havana, 2019)", album: "x" }, "Rapture")).toBe(true);
    expect(badVersion({ title: "Rapture", album: "Live at the Palace (live)" }, "Rapture")).toBe(true);
    expect(badVersion({ title: "Fight for Your Right (Made Famous by Beastie Boys)", album: "x" }, "Fight for Your Right")).toBe(true);
    expect(badVersion({ title: "Rapture (Special Disco Mix / Remastered 2001)", album: "x" }, "Rapture")).toBe(true);
  });
  it("skips a remix single even when the title is clean", () => {
    expect(badVersion({ title: "Mama Said Knock You Out", album: "Mama Said Knock You Out (Sam Wilkes Remix)" }, "Mama Said Knock You Out")).toBe(true);
  });
  it("keeps remasters and album tracks", () => {
    expect(badVersion({ title: "Rapture (Remastered 2001)", album: "Autoamerican (Remastered 2001)" }, "Rapture")).toBe(false);
    expect(badVersion({ title: "Bohemian Rhapsody", album: "A Night At The Opera" }, "Bohemian Rhapsody")).toBe(false);
  });
  it("allows a version word the wanted title itself uses", () => {
    expect(badVersion({ title: "Hung Up (Live)", album: "x" }, "Hung Up (Live)")).toBe(false);
  });
});

describe("chooseMatch", () => {
  it("takes the clear original", () => {
    const m = chooseMatch({ artist: "Beastie Boys", title: "Fight for Your Right" }, [
      c("Fight For Your Right", "Beastie Boys", "Licensed To Ill", 207, 500000),
      c("Fight for Your Right (Made Famous by Beastie Boys)", "Guitar Warriors", "Guitar Lick Ringtones", 30, 10),
      c("Fight for Your Right", "8-Bit Misfits", "8-Bit Versions of Beastie Boys", 189, 5),
    ]);
    expect(m.status).toBe("ok");
    expect(m.chosen?.durationSec).toBe(207);
  });
  it("accepts a feat. result and skips the demo and instrumental", () => {
    const m = chooseMatch({ artist: "Run-DMC", title: "Walk This Way" }, [
      c("Walk This Way (feat. Aerosmith)", "Run DMC", "High Profile", 311, 400000),
      c("Walk This Way (Demo)", "Run DMC", "Raising Hell (Expanded Edition)", 325, 40000),
      c("Walk This Way (Instrumental)", "Run DMC", "Walk This Way", 241, 20000),
    ]);
    expect(m.status).toBe("ok");
    expect(m.chosen?.durationSec).toBe(311);
  });
  it("flags real disagreement between plausible versions", () => {
    const m = chooseMatch({ artist: "Blondie", title: "Rapture" }, [
      c("Rapture (Remastered 2001)", "Blondie", "Autoamerican (Remastered 2001)", 391, 325327),
      c("Rapture (Special Disco Mix / Remastered 2001)", "Blondie", "Autoamerican (Remastered 2001)", 600, 217930),
      c("Rapture (Remastered 2002)", "Blondie", "Greatest Hits", 336, 191315),
      c("Rapture", "Blondie", "Once More Into The Bleach", 297, 87662),
    ]);
    expect(m.status).toBe("doubtful");
    expect(m.candidates.map((x) => x.durationSec)).toEqual([391, 336, 297]);
  });
  it("does not flag a tiny difference or a far-less-played rival", () => {
    const m = chooseMatch({ artist: "Queen", title: "Bohemian Rhapsody" }, [
      c("Bohemian Rhapsody", "Queen", "A Night At The Opera", 354, 900000),
      c("Bohemian Rhapsody (Remastered 2011)", "Queen", "Greatest Hits", 355, 800000),
      c("Bohemian Rhapsody", "Queen", "Obscure", 300, 1000),
    ]);
    expect(m.status).toBe("ok");
  });
  it("reports missing with a reason", () => {
    expect(chooseMatch({ artist: "Nobody", title: "Nothing" }, []).status).toBe("missing");
    const m = chooseMatch({ artist: "Blondie", title: "Rapture" }, [c("Rapture (Live)", "Blondie", "x", 593, 10)]);
    expect(m.status).toBe("missing");
    expect(m.reason).toMatch(/live/i);
  });
});
