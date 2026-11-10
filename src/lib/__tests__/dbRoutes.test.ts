import { describe, expect, it, beforeEach } from "vitest";
import { FakeDb } from "../db/__tests__/fakeDb";
import { resolveSongs, rememberSong } from "../songs/resolve";
import type { Candidate } from "../songs/match";
import { PATCH as patchLog, DELETE as deleteLogRoute } from "../../app/api/history/[id]/route";
import { GET as getRides } from "../../app/api/rides/route";
import { GET as getHistory } from "../../app/api/history/route";
import { GET as getSettingsRoute } from "../../app/api/settings/route";
import { GET as getRideRoute } from "../../app/api/rides/[id]/route";

beforeEach(() => { delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; });

const req = (body: unknown) => new Request("http://x/api", { method: "PATCH", body: JSON.stringify(body) });

describe("routes without a database", () => {
  it("keep the configured:false shape the UI expects", async () => {
    expect(await (await getRides()).json()).toEqual({ configured: false, rides: [] });
    expect(await (await getHistory()).json()).toEqual({ configured: false, logs: [] });
    expect(await (await getSettingsRoute()).json()).toEqual({ configured: false, hiddenPresets: [] });
  });
  it("answer 503 when a saved ride is asked for", async () => {
    const res = await getRideRoute(new Request("http://x/api/rides/abc"), { params: { id: "abc" } });
    expect(res.status).toBe(503);
  });
  it("accept both id styles for history rows, and refuse junk before touching the database", async () => {
    const ok = [{ id: "recAbCdEfGhIjKlMn" }, { id: "3f2b8c1e-9d4a-4f6b-8a1c-2e7d5b9c0a11" }];
    for (const c of ok) expect((await patchLog(req({ kcal: 100 }), { params: c })).status).toBe(503); // past the id check, then no database
    for (const id of ["nope", "rec123", "../etc", "3f2b8c1e-9d4a-4f6b-8a1c"]) {
      expect((await patchLog(req({ kcal: 100 }), { params: { id } })).status).toBe(400);
      expect((await deleteLogRoute(new Request("http://x"), { params: { id } })).status).toBe(400);
    }
  });
});

describe("planning songs and the cache", () => {
  const cand = (n: number): Candidate => ({ id: String(n), title: `Song ${n}`, artist: `Artist ${n}`, album: "Alb", durationSec: 200 + n, rank: 1000 });
  it("a 12-song plan costs one cache read plus one upsert per new song, never a per-song lookup", async () => {
    const db = new FakeDb("preview");
    const songs = Array.from({ length: 12 }, (_, i) => ({ artist: `Artist ${i}`, title: `Song ${i}` }));
    const out = await resolveSongs(songs, async (q) => [cand(Number(q.title.split(" ")[1]))], db.asClient());
    expect(out.every((s) => s.status === "ok" && s.durationSec)).toBe(true);
    expect(db.calls.filter((c) => c === "select songs")).toHaveLength(1);
    expect(db.calls.filter((c) => c === "upsert songs")).toHaveLength(12);
    expect(db.calls).toHaveLength(13);
    // the second plan of the same songs is one read and no search at all
    let searches = 0;
    db.calls.length = 0;
    const again = await resolveSongs(songs, async () => { searches++; return []; }, db.asClient());
    expect(again.every((s) => s.status === "cached")).toBe(true);
    expect(searches).toBe(0);
    expect(db.calls).toEqual(["select songs"]);
  });
  it("remembering a typed length or a confirmed version is one upsert and sticks", async () => {
    const db = new FakeDb();
    expect(await rememberSong({ artist: "A", title: "B" }, { durationSec: 187 }, db.asClient())).toBe(true);
    const [row] = db.table("songs");
    expect(row).toMatchObject({ duration_sec: 187, source: "typed", confirmed: true });
    expect(db.calls).toEqual(["upsert songs"]);
  });
});
