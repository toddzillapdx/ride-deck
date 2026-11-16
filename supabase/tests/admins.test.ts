import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import pg from "pg";

const { host, port } = inject("pg");
const ADMIN = { id: "dddddddd-0000-4000-8000-00000000000d", email: "Boss@Example.com" }; // mixed case on purpose
const RIDER = { id: "eeeeeeee-0000-4000-8000-00000000000e", email: "rider@example.com" };
type Who = "anon" | "service" | { id: string; email: string };

let root: pg.Client;

async function as<T>(who: Who, fn: (q: (sql: string, p?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>): Promise<T> {
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

beforeAll(async () => {
  root = new pg.Client({ host, port, user: "postgres", database: "postgres" });
  await root.connect();
  for (const u of [ADMIN, RIDER]) await root.query("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [u.id, u.email.toLowerCase()]);
  await root.query("insert into public.admins (email, note) values ('boss@example.com', 'curator') on conflict do nothing");
});
afterAll(async () => { await root?.end(); });

describe("admin role", () => {
  it("is_admin() is true for a listed email, whatever the case of the signed-in email", async () => {
    expect((await as(ADMIN, (q) => q("select public.is_admin() as a"))).rows[0].a).toBe(true);
  });
  it("is_admin() is false for a rider who is not listed", async () => {
    expect((await as(RIDER, (q) => q("select public.is_admin() as a"))).rows[0].a).toBe(false);
  });
  it("is_admin() is false when there is no email in the session", async () => {
    const r = await as({ id: RIDER.id, email: "" }, (q) => q("select public.is_admin() as a"));
    expect(r.rows[0].a).toBe(false);
  });
  it("anonymous callers cannot call is_admin()", async () => {
    await expect(as("anon", (q) => q("select public.is_admin()"))).rejects.toThrow(/permission denied/i);
  });
  it("the admins list is invisible and read-only to signed-in people (no self-promotion)", async () => {
    await expect(as(RIDER, (q) => q("select * from public.admins"))).rejects.toThrow(/permission denied/i);
    await expect(as(RIDER, (q) => q("insert into public.admins (email) values ('rider@example.com')"))).rejects.toThrow(/permission denied/i);
    await expect(as(ADMIN, (q) => q("insert into public.admins (email) values ('x@example.com')"))).rejects.toThrow(/permission denied/i);
  });
  it("being on the invite list or exempt from limits does not make anyone an admin", async () => {
    await root.query("insert into public.invites (email, exempt) values ('rider@example.com', true) on conflict (email) do update set exempt = true");
    expect((await as(RIDER, (q) => q("select public.is_admin() as a"))).rows[0].a).toBe(false);
  });
  it("emails are stored lowercase", async () => {
    await expect(root.query("insert into public.admins (email) values ('Upper@Example.com')")).rejects.toThrow(/check/i);
  });
  it("the service key can manage the list", async () => {
    const r = await as("service", (q) => q("select count(*)::int as n from public.admins"));
    expect(r.rows[0].n).toBeGreaterThanOrEqual(1);
  });
});
