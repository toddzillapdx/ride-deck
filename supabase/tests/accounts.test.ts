import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const { host, port } = inject("pg");
const A = { id: "aaaaaaaa-0000-4000-8000-00000000000a", email: "a@example.com" };
const B = { id: "bbbbbbbb-0000-4000-8000-00000000000b", email: "b@example.com" };
const ADMIN = { id: "cccccccc-0000-4000-8000-00000000000c", email: "admin@example.com" };
type Who = "anon" | "service" | { id: string; email: string };
type Q = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;

let root: pg.Client;
const file = (f: string) => readFileSync(path.join(__dirname, "..", f), "utf8");

/** Run `fn` as a Supabase role inside a transaction that is always rolled back, so tests never leak into each other. */
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
    return await fn((sql, params) => c.query(sql, params));
  } finally {
    await c.query("rollback").catch(() => undefined);
    await c.end();
  }
}

/** The statement must be refused (by row-level security or a missing grant). */
async function refused(q: Q, sql: string, params?: unknown[]) {
  await q("savepoint s");
  let err: Error | null = null;
  try { await q(sql, params); } catch (e) { err = e as Error; }
  await q("rollback to savepoint s");
  expect(err, `expected "${sql.slice(0, 60)}" to be refused`).not.toBeNull();
  expect(String(err?.message)).toMatch(/row-level security|permission denied|not signed in/i);
}

const ride = (name: string, owner: string | null) => root.query("insert into public.rides (name, workout, user_id) values ($1, '{}', $2)", [name, owner]);

beforeAll(async () => {
  root = new pg.Client({ host, port, user: "postgres", database: "postgres" });
  await root.connect();
  for (const u of [A, B, ADMIN]) await root.query("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [u.id, u.email]);
  await root.query("insert into public.invites (email, exempt) values ('a@example.com', false), ('b@example.com', false), ('admin@example.com', true) on conflict do nothing");
  await ride("A's ride", A.id);
  await ride("B's ride", B.id);
  await ride("Legacy ride (no owner yet)", null);
  await root.query("insert into public.ride_logs (name, started_at, user_id) values ('A ride log', now(), $1), ('B ride log', now(), $2), ('legacy log', now(), null)", [A.id, B.id]);
  await root.query("insert into public.app_settings (key, value, user_id) values ('main', '{\"hiddenPresets\":[\"x\"]}', null)");
  await root.query("insert into public.songs (key, duration_sec, source) values ('a|b', 200, 'deezer')");
});
afterAll(async () => { await root?.end(); });

describe("migrations", () => {
  it("0002 can be run again without error", async () => {
    await root.query(file("migrations/0002_accounts.sql"));
    await root.query(file("migrations/0002_accounts.sql"));
  });
});

describe("rides are private", () => {
  it("you see only your own rides, and rides with no owner are invisible", async () => {
    expect((await as(A, (q) => q("select name from public.rides"))).rows.map((r) => r.name)).toEqual(["A's ride"]);
    expect((await as(B, (q) => q("select name from public.rides"))).rows.map((r) => r.name)).toEqual(["B's ride"]);
  });
  it("signed-out visitors see nothing and cannot write", async () => {
    expect((await as("anon", (q) => q("select * from public.rides"))).rowCount).toBe(0);
    await as("anon", async (q) => { await refused(q, "insert into public.rides (name, workout, user_id) values ('x', '{}', null)"); });
  });
  it("nobody can read, change or delete someone else's ride", async () => {
    await as(B, async (q) => {
      expect((await q("select * from public.rides where name = 'A''s ride'")).rowCount).toBe(0);
      expect((await q("update public.rides set name = 'hacked' where name = 'A''s ride'")).rowCount).toBe(0);
      expect((await q("delete from public.rides where name = 'A''s ride'")).rowCount).toBe(0);
    });
    expect((await root.query("select name from public.rides where user_id = $1", [A.id])).rows[0].name).toBe("A's ride");
  });
  it("you cannot create a ride for someone else, or take one over by changing its owner", async () => {
    await as(B, async (q) => {
      await refused(q, "insert into public.rides (name, workout, user_id) values ('fake', '{}', $1)", [A.id]);
      await refused(q, "update public.rides set user_id = $1 where user_id = $2", [A.id, B.id]);
    });
  });
  it("a ride you create is yours without saying so", async () => {
    await as(A, async (q) => {
      const r = await q("insert into public.rides (name, workout) values ('new', '{}') returning user_id");
      expect(r.rows[0].user_id).toBe(A.id);
    });
  });
  it("the server key (service role) still sees and writes everything, so the current app keeps working", async () => {
    const all = await as("service", (q) => q("select name from public.rides"));
    expect(all.rowCount).toBe(3);
    await as("service", (q) => q("insert into public.rides (name, workout) values ('from the old code path', '{}')"));
  });
});

describe("history and settings are private too", () => {
  it("history is per person", async () => {
    expect((await as(A, (q) => q("select name from public.ride_logs"))).rows.map((r) => r.name)).toEqual(["A ride log"]);
    await as(B, async (q) => {
      expect((await q("delete from public.ride_logs where name = 'A ride log'")).rowCount).toBe(0);
      await refused(q, "insert into public.ride_logs (name, started_at, user_id) values ('x', now(), $1)", [A.id]);
    });
  });
  it("settings are per person: two people can both have a 'main' row (once 0003 is applied)", async () => {
    expect((await as(A, (q) => q("select * from public.app_settings"))).rowCount).toBe(0); // the old row has no owner
  });
});

describe("the shared song cache", () => {
  it("signed-in users can read it but never write to it", async () => {
    await as(A, async (q) => {
      expect((await q("select key from public.songs")).rowCount).toBe(1);
      await refused(q, "insert into public.songs (key, duration_sec, source) values ('x|y', 100, 'typed')");
      expect((await q("update public.songs set duration_sec = 1")).rowCount).toBe(0);
      expect((await q("delete from public.songs")).rowCount).toBe(0);
    });
    expect((await as("anon", (q) => q("select * from public.songs"))).rowCount).toBe(0);
    await as("service", (q) => q("insert into public.songs (key, duration_sec, source) values ('x|y', 100, 'typed')"));
  });
});

describe("the invite list", () => {
  it("users cannot read or change it", async () => {
    await as(A, async (q) => {
      await refused(q, "select * from public.invites");
      await refused(q, "insert into public.invites (email) values ('me@example.com')");
    });
    await as("anon", async (q) => { await refused(q, "select * from public.invites"); });
  });
  it("the sign-up hook lets invited emails in (any capitalisation) and refuses everyone else", async () => {
    const hook = (email: string) => root.query("select public.hook_before_user_created($1::jsonb) as r", [JSON.stringify({ user: { email } })]).then((r) => r.rows[0].r);
    expect(await hook("a@example.com")).toEqual({});
    expect(await hook("A@Example.COM")).toEqual({});
    expect((await hook("stranger@example.com")).error.http_code).toBe(403);
    expect((await hook("")).error).toBeTruthy();
  });
  it("users cannot call the hook directly", async () => {
    await as(A, async (q) => { await refused(q, "select public.hook_before_user_created('{}'::jsonb)"); });
  });
});

describe("planner limits", () => {
  const use = (q: Q, kind = "plan", limit = 5) => q("select public.consume_quota($1, $2) as r", [kind, limit]).then((r) => r.rows[0].r);
  it("allows exactly the limit within a week, then refuses, and says when it frees up", async () => {
    await as(A, async (q) => {
      for (let i = 1; i <= 5; i++) { const r = await use(q); expect(r).toMatchObject({ allowed: true, used: i, remaining: 5 - i, limit: 5 }); }
      const no = await use(q);
      expect(no).toMatchObject({ allowed: false, used: 5, remaining: 0 });
      expect(new Date(no.resets_at).getTime()).toBeGreaterThan(Date.now() + 6 * 86400_000);
    });
  });
  it("uses outside the 7-day window do not count", async () => {
    await root.query("insert into public.usage_events (user_id, kind, created_at) select $1, 'plan', now() - interval '8 days' from generate_series(1, 5)", [B.id]);
    await as(B, async (q) => { expect((await use(q)).allowed).toBe(true); });
    await root.query("delete from public.usage_events where user_id = $1", [B.id]);
  });
  it("plans and swaps are counted separately, and people do not share a count", async () => {
    await as(A, async (q) => {
      for (let i = 0; i < 5; i++) await use(q, "plan");
      expect((await use(q, "plan")).allowed).toBe(false);
      expect((await use(q, "swap", 30)).allowed).toBe(true);
    });
    await as(B, async (q) => { expect((await use(q, "plan")).allowed).toBe(true); });
  });
  it("a refund gives one use back", async () => {
    await as(A, async (q) => {
      for (let i = 0; i < 5; i++) await use(q);
      expect((await use(q)).allowed).toBe(false);
      await q("select public.refund_quota('plan')");
      expect((await use(q)).allowed).toBe(true);
    });
  });
  it("an exempt invite (the owner) is never refused", async () => {
    await as(ADMIN, async (q) => {
      for (let i = 0; i < 8; i++) expect((await use(q, "plan", 5)).allowed).toBe(true);
      expect((await q("select public.quota_status('plan', 5) as r")).rows[0].r).toMatchObject({ exempt: true, remaining: null });
    });
  });
  it("quota_status reports without using one", async () => {
    await as(A, async (q) => {
      await use(q); await use(q);
      const s = (await q("select public.quota_status('plan', 5) as r")).rows[0].r;
      expect(s).toMatchObject({ used: 2, remaining: 3, limit: 5, exempt: false });
      expect((await q("select public.quota_status('plan', 5) as r")).rows[0].r.used).toBe(2);
    });
  });
  it("signed-out visitors cannot use the planner quota, and nobody can fake the counter", async () => {
    await as("anon", async (q) => { await refused(q, "select public.consume_quota('plan', 5)"); });
    await as(A, async (q) => {
      await refused(q, "insert into public.usage_events (user_id, kind) values ($1, 'plan')", [A.id]);
      await refused(q, "delete from public.usage_events");
      await q("select public.consume_quota('plan', 5)");
      expect((await q("select * from public.usage_events")).rowCount).toBe(1); // you can read your own use
    });
    await as(B, async (q) => { expect((await q("select * from public.usage_events")).rowCount).toBe(0); }); // but not anyone else's
  });
  it("rejects an unknown kind", async () => {
    await as(A, async (q) => { await q("savepoint s"); await expect(q("select public.consume_quota('bogus', 5)")).rejects.toThrow(/unknown quota kind/); await q("rollback to savepoint s"); });
  });
});

describe("handing the existing data to you, then requiring owners (0003)", () => {
  it("0003 refuses to run while any row has no owner", async () => {
    await expect(root.query(file("migrations/0003_require_owner.sql"))).rejects.toThrow(/backfill-owner/);
  });
  it("the backfill refuses an email that has not signed up", async () => {
    await expect(root.query(file("backfill-owner.sql"))).rejects.toThrow(/No account found/);
  });
  it("the backfill gives every ownerless row to one account and leaves other people's rows alone", async () => {
    const sql = file("backfill-owner.sql").replaceAll("YOUR_EMAIL_HERE", "a@example.com");
    await root.query(sql);
    expect((await root.query("select count(*)::int n from public.rides where user_id is null")).rows[0].n).toBe(0);
    expect((await root.query("select count(*)::int n from public.rides where user_id = $1", [A.id])).rows[0].n).toBe(2); // its own ride plus the legacy one
    expect((await root.query("select count(*)::int n from public.rides where user_id = $1", [B.id])).rows[0].n).toBe(1);
    await root.query(sql); // safe to run again
    expect((await as(A, (q) => q("select name from public.rides"))).rows.map((r) => r.name)).toContain("Legacy ride (no owner yet)");
  });
  it("0003 then makes owners required and settings one row per person", async () => {
    await root.query(file("migrations/0003_require_owner.sql"));
    await root.query(file("migrations/0003_require_owner.sql")); // idempotent
    await expect(root.query("insert into public.rides (name, workout) values ('orphan', '{}')")).rejects.toThrow(/null value/);
    await as(B, async (q) => {
      await q("insert into public.app_settings (key, value) values ('main', '{\"hiddenPresets\":[]}')");
      expect((await q("select value from public.app_settings")).rowCount).toBe(1);
    });
    await root.query("insert into public.app_settings (user_id, key, value) values ($1, 'main', '{\"hiddenPresets\":[\"z\"]}')", [B.id]).catch(() => undefined);
    expect((await as(A, (q) => q("select value from public.app_settings"))).rows[0].value.hiddenPresets).toEqual(["x"]); // the old single setting went to A
  });
});

describe("deleting an account", () => {
  it("removes all of that person's data, and only theirs", async () => {
    await root.query("insert into public.usage_events (user_id, kind) values ($1, 'plan')", [B.id]);
    await root.query("delete from auth.users where id = $1", [B.id]);
    for (const t of ["rides", "ride_logs", "app_settings", "usage_events"]) {
      expect((await root.query(`select count(*)::int n from public.${t} where user_id = $1`, [B.id])).rows[0].n, t).toBe(0);
    }
    expect((await root.query("select count(*)::int n from public.rides where user_id = $1", [A.id])).rows[0].n).toBeGreaterThan(0);
  });
});
