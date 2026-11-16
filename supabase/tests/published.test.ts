import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import pg from "pg";

const { host, port } = inject("pg");
const ADMIN = { id: "dddddddd-0000-4000-8000-0000000000d1", email: "boss@example.com" };
const RIDER = { id: "eeeeeeee-0000-4000-8000-0000000000e1", email: "rider@example.com" };
const RIDER2 = { id: "eeeeeeee-0000-4000-8000-0000000000e2", email: "rider2@example.com" };
type Who = "anon" | "service" | { id: string; email: string };
type Q = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;

let root: pg.Client;

/** Run as a Supabase role inside a transaction that is always rolled back. */
async function as<T>(who: Who, fn: (q: Q) => Promise<T>): Promise<T> {
  const c = new pg.Client({ host, port, user: "postgres", database: "postgres" });
  await c.connect();
  try {
    await c.query("begin");
    if (who === "anon") await c.query("set local role anon");
    else if (who === "service") await c.query("set local role service_role");
    else {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who.id, email: who.email, role: "authenticated" })]);
    }
    return await fn((sql, p) => c.query(sql, p));
  } finally { await c.query("rollback").catch(() => undefined); await c.end(); }
}

/** The statement must fail with a message matching `re`. The transaction survives (savepoint). */
async function fails(q: Q, sql: string, re: RegExp, params?: unknown[]) {
  await q("savepoint s");
  let err: Error | null = null;
  try { await q(sql, params); } catch (e) { err = e as Error; }
  await q("rollback to savepoint s");
  expect(err, `expected failure: ${sql.slice(0, 70)}`).not.toBeNull();
  expect(String(err?.message)).toMatch(re);
}

/** Same, for statements run directly as the database owner (no transaction to roll back; a failed statement changes nothing). */
async function rootFails(sql: string, re: RegExp) {
  let err: Error | null = null;
  try { await root.query(sql); } catch (e) { err = e as Error; }
  expect(err, `expected failure: ${sql.slice(0, 70)}`).not.toBeNull();
  expect(String(err?.message)).toMatch(re);
}

const URLS = { spotify: "https://open.spotify.com/playlist/abc", apple: "https://music.apple.com/us/playlist/abc", amazon: "https://music.amazon.com/playlists/abc" };
const RIDE = JSON.stringify({ schemaVersion: 2, name: "Test ride", segments: [] });

/** A draft ride made by the admin (root = postgres, bypasses policies, like a setup step). */
async function makeRide(title: string, links: (keyof typeof URLS)[] = [], status: "draft" | "published" = "draft") {
  const r = await root.query("insert into public.curated_rides (title, ride) values ($1, $2) returning id", [title, RIDE]);
  const id = r.rows[0].id as string;
  for (const s of links) await root.query("insert into public.curated_playlists (ride_id, service, url) values ($1, $2, $3)", [id, s, URLS[s]]);
  if (status === "published") await root.query("update public.curated_rides set status = 'published' where id = $1", [id]);
  return id;
}

beforeAll(async () => {
  root = new pg.Client({ host, port, user: "postgres", database: "postgres" });
  await root.connect();
  for (const u of [ADMIN, RIDER, RIDER2]) await root.query("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [u.id, u.email]);
  await root.query("insert into public.admins (email, note) values ('boss@example.com', 'curator') on conflict do nothing");
});
beforeEach(async () => { await root.query("delete from public.ride_events"); await root.query("update public.curated_rides set status = 'draft'"); await root.query("delete from public.curated_playlists"); await root.query("delete from public.curated_rides"); });
afterAll(async () => { await root?.end(); });

describe("publishing needs a playlist", () => {
  it("a ride starts as a draft; inserting it already published is refused", async () => {
    await rootFails("insert into public.curated_rides (title, ride, status) values ('x', '{}', 'published')", /starts as a draft/);
  });
  it("cannot be published with no playlist link at all", async () => {
    const id = await makeRide("R", []);
    await as(ADMIN, (q) => fails(q, "update public.curated_rides set status = 'published' where id = $1", /at least one playlist link/, [id]));
  });
  for (const links of [["spotify"], ["amazon"], ["spotify", "amazon"], ["spotify", "apple", "amazon"]] as (keyof typeof URLS)[][]) {
    it(`can be published with ${links.join(" + ")}, and published_at is set`, async () => {
      const id = await makeRide("R", links);
      const r = await as(ADMIN, (q) => q("update public.curated_rides set status = 'published' where id = $1 returning status, published_at", [id]));
      expect(r.rows[0].status).toBe("published");
      expect(r.rows[0].published_at).not.toBeNull();
    });
  }
  it("links must be https with no spaces, for a known service", async () => {
    const id = await makeRide("R");
    const ins = (service: string, url: string) => as(ADMIN, (q) => fails(q, "insert into public.curated_playlists (ride_id, service, url) values ($1, $2, $3)", /check/i, [id, service, url]));
    await ins("spotify", "http://open.spotify.com/x");
    await ins("spotify", "javascript:alert(1)");
    await ins("spotify", "https://open.spotify.com/a b");
    await ins("youtube", "https://music.youtube.com/x");
    await ins("spotify", "");
  });
  it("month is optional and must look like 2027-01", async () => {
    await root.query("insert into public.curated_rides (title, ride, month) values ('a', '{}', '2027-01'), ('b', '{}', null)");
    await rootFails("insert into public.curated_rides (title, ride, month) values ('c', '{}', '2027-13')", /check/i);
    await rootFails("insert into public.curated_rides (title, ride, month) values ('c', '{}', 'January')", /check/i);
  });
});

describe("a live ride stays whole", () => {
  it("a published ride can never lose its last playlist link, but a link can be replaced", async () => {
    const id = await makeRide("R", ["spotify"], "published");
    await as(ADMIN, (q) => fails(q, "delete from public.curated_playlists where ride_id = $1 and service = 'spotify'", /needs a playlist link/, [id]));
    const r = await as(ADMIN, (q) => q("update public.curated_playlists set url = 'https://open.spotify.com/new' where ride_id = $1 and service = 'spotify' returning url", [id]));
    expect(r.rows[0].url).toBe("https://open.spotify.com/new");
    await as(ADMIN, (q) => fails(q, "update public.curated_playlists set service = 'apple' where ride_id = $1 and service = 'spotify'", /cannot move/i, [id]));
  });
  it("a published ride with two links can drop one (the app guards the switched-on services), but not both", async () => {
    const id = await makeRide("R", ["spotify", "amazon"], "published");
    await as(ADMIN, async (q) => {
      await q("delete from public.curated_playlists where ride_id = $1 and service = 'amazon'", [id]);
      await fails(q, "delete from public.curated_playlists where ride_id = $1 and service = 'spotify'", /needs a playlist link/, [id]);
    });
  });
  it("cannot be deleted while published; a draft can be, and its links go with it", async () => {
    const live = await makeRide("Live", ["spotify", "apple", "amazon"], "published");
    await as(ADMIN, (q) => fails(q, "delete from public.curated_rides where id = $1", /Unpublish/, [live]));
    const draft = await makeRide("Draft", ["spotify"]);
    await as(ADMIN, async (q) => {
      await q("delete from public.curated_rides where id = $1", [draft]);
      expect((await q("select count(*)::int n from public.curated_playlists where ride_id = $1", [draft])).rows[0].n).toBe(0);
    });
  });
  it("after unpublishing, links can be removed again and the ride can be deleted", async () => {
    const id = await makeRide("R", ["spotify", "apple", "amazon"], "published");
    await as(ADMIN, async (q) => {
      await q("update public.curated_rides set status = 'draft' where id = $1", [id]);
      await q("delete from public.curated_playlists where ride_id = $1 and service = 'apple'", [id]);
      await q("delete from public.curated_rides where id = $1", [id]);
    });
  });
  it("segments are locked once a ride has ever been published, even after unpublishing; text stays editable", async () => {
    const id = await makeRide("R", ["spotify", "apple", "amazon"], "published");
    await as(ADMIN, async (q) => {
      await fails(q, "update public.curated_rides set ride = '{\"changed\":true}' where id = $1", /locked/, [id]);
      await q("update public.curated_rides set title = 'New title', blurb = 'Hills and hooks', month = '2027-02' where id = $1", [id]);
      await q("update public.curated_rides set status = 'draft' where id = $1", [id]);
      await fails(q, "update public.curated_rides set ride = '{\"changed\":true}' where id = $1", /locked/, [id]);
    });
  });
  it("a draft that was never published can have its segments changed", async () => {
    const id = await makeRide("R");
    await as(ADMIN, (q) => q("update public.curated_rides set ride = '{\"changed\":true}' where id = $1", [id]));
  });
});

describe("who can see and change what", () => {
  it("riders see published rides and their links, never drafts", async () => {
    const live = await makeRide("Live", ["spotify", "apple", "amazon"], "published");
    const draft = await makeRide("Draft", ["spotify"]);
    await as(RIDER, async (q) => {
      const rides = (await q("select id from public.curated_rides")).rows.map((r) => r.id);
      expect(rides).toEqual([live]);
      const links = (await q("select ride_id, service from public.curated_playlists")).rows;
      expect(links.every((l) => l.ride_id === live)).toBe(true);
      expect(links).toHaveLength(3);
      expect((await q("select * from public.curated_rides where id = $1", [draft])).rows).toHaveLength(0);
    });
  });
  it("the admin sees drafts too", async () => {
    await makeRide("Live", ["spotify", "apple", "amazon"], "published");
    await makeRide("Draft", ["spotify"]);
    expect((await as(ADMIN, (q) => q("select id from public.curated_rides"))).rows).toHaveLength(2);
  });
  it("riders cannot create, change, publish or delete anything", async () => {
    const live = await makeRide("Live", ["spotify", "apple", "amazon"], "published");
    const draft = await makeRide("Draft", ["spotify", "apple", "amazon"]);
    await as(RIDER, async (q) => {
      await fails(q, "insert into public.curated_rides (title, ride) values ('x', '{}')", /row-level security/);
      await fails(q, "insert into public.curated_playlists (ride_id, service, url) values ($1, 'amazon', 'https://x.example/')", /row-level security/, [live]);
      // a rider cannot publish a draft: the update matches no visible row, so nothing changes
      const r = await q("update public.curated_rides set status = 'published' where id = $1", [draft]);
      expect(r.rowCount).toBe(0);
      expect((await q("update public.curated_rides set title = 'hacked' where id = $1", [live])).rowCount).toBe(0);
      expect((await q("delete from public.curated_rides where id = $1", [live])).rowCount).toBe(0);
      expect((await q("update public.curated_playlists set url = 'https://evil.example/' where ride_id = $1", [live])).rowCount).toBe(0);
      expect((await q("delete from public.curated_playlists where ride_id = $1", [live])).rowCount).toBe(0);
    });
    const after = await root.query("select title, status from public.curated_rides order by title");
    expect(after.rows).toEqual([{ title: "Draft", status: "draft" }, { title: "Live", status: "published" }]);
  });
  it("signed-out callers get nothing", async () => {
    await as("anon", (q) => fails(q, "select * from public.curated_rides", /permission denied/));
    await as("anon", (q) => fails(q, "select * from public.curated_playlists", /permission denied/));
    await as("anon", (q) => fails(q, "insert into public.ride_events (user_id, ride_id, kind) values ('00000000-0000-0000-0000-000000000000', 'x', 'opened')", /permission denied/));
  });
});

describe("ride events", () => {
  it("a rider can record their own events, with a service", async () => {
    await as(RIDER, async (q) => {
      await q("insert into public.ride_events (ride_id, service, kind) values ('pub-1', 'spotify', 'opened')");
      await q("insert into public.ride_events (ride_id, service, kind) values ('pub-1', 'spotify', 'playlist_opened')");
      await q("insert into public.ride_events (ride_id, kind) values ('preset-x', 'started')");
    });
  });
  it("the rider is always the signed-in person: recording an event as someone else is refused", async () => {
    await as(RIDER, (q) => fails(q, "insert into public.ride_events (user_id, ride_id, kind) values ($1, 'pub-1', 'opened')", /row-level security/, [RIDER2.id]));
  });
  it("kinds and services are limited", async () => {
    await as(RIDER, async (q) => {
      await fails(q, "insert into public.ride_events (ride_id, kind) values ('pub-1', 'hacked')", /check/i);
      await fails(q, "insert into public.ride_events (ride_id, service, kind) values ('pub-1', 'tidal', 'opened')", /check/i);
    });
  });
  it("riders cannot read events, not even their own; the admin can read all", async () => {
    await root.query("insert into public.ride_events (user_id, ride_id, service, kind) values ($1, 'pub-1', 'apple', 'started'), ($2, 'pub-1', 'spotify', 'finished')", [RIDER.id, RIDER2.id]);
    expect((await as(RIDER, (q) => q("select * from public.ride_events"))).rows).toHaveLength(0);
    expect((await as(ADMIN, (q) => q("select * from public.ride_events"))).rows).toHaveLength(2);
  });
  it("deleting an account removes its events", async () => {
    const U = { id: "ffffffff-0000-4000-8000-0000000000f1", email: "gone@example.com" };
    await root.query("insert into auth.users (id, email) values ($1, $2)", [U.id, U.email]);
    await root.query("insert into public.ride_events (user_id, ride_id, kind) values ($1, 'x', 'opened')", [U.id]);
    await root.query("delete from auth.users where id = $1", [U.id]);
    expect((await root.query("select count(*)::int n from public.ride_events where user_id = $1", [U.id])).rows[0].n).toBe(0);
  });
});
