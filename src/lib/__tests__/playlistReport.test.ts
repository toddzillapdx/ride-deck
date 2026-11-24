import { describe, expect, it } from "vitest";
import { parseLengthReport } from "../playlistReport";

const songs = [
  { artist: "Wu-Tang Clan", title: "Bring da Ruckus" },
  { artist: "Warren G", title: "Regulate" },
  { artist: "Snoop Dogg", title: "Gin and Juice" },
  { artist: "Dr. Dre", title: "Nuthin' but a \"G\" Thang" },
  { artist: "House of Pain", title: "Jump Around" },
  { artist: "Black Sheep", title: "The Choice Is Yours" },
];
const sec = (r: ReturnType<typeof parseLengthReport>) => Object.fromEntries(r.matches.map((m) => [songs[m.index].title, m.durationSec]));

describe("parseLengthReport", () => {
  it("reads 'Title: m:ss (target m:ss)' and uses the actual length, not the target", () => {
    const r = parseLengthReport("Regulate: 4:11 (target 3:46)\nGin and Juice: 3:32 (target 3:30)", songs);
    expect(sec(r)).toEqual({ Regulate: 251, "Gin and Juice": 212 });
  });
  it("handles numbering, bullets, artist prefixes, dashes and markdown", () => {
    const r = parseLengthReport("1. **Warren G - Regulate** – 4:11 (target 3:46)\n- Snoop Dogg – Gin and Juice: 3:32\n3) House of Pain - Jump Around 3:16", songs);
    expect(sec(r)).toEqual({ Regulate: 251, "Gin and Juice": 212, "Jump Around": 196 });
  });
  it("matches spelling differences like Nuthin' / Nothing", () => {
    const r = parseLengthReport('Dr. Dre - Nothin\' But a "G" Thang: 3:58 (target 3:59)', songs);
    expect(sec(r)).toEqual({ 'Nuthin\' but a "G" Thang': 238 });
  });
  it("ignores totals, links and prose, and reports unmatched song lines", () => {
    const r = parseLengthReport("Playlist: https://music.amazon.com/playlists/B0ABC\nTotal is 34:25\nSome Other Song: 3:10 (target 3:08)\nDone!", songs);
    expect(r.matches).toEqual([]);
    expect(r.unmatched).toEqual(["Some Other Song: 3:10 (target 3:08)"]);
  });
  it("uses each song once (first line wins) and rejects silly lengths", () => {
    const r = parseLengthReport("Regulate: 4:11\nRegulate: 9:99\nGin and Juice: 0:05", songs);
    expect(sec(r)).toEqual({ Regulate: 251 });
  });
  it("does not match on a single shared common word", () => {
    const r = parseLengthReport("Jump: 3:16", songs);
    expect(r.matches).toEqual([]); // 'Jump' is only half of "Jump Around": too weak to apply a length
  });
});
