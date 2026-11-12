import { beforeEach, describe, expect, it, vi } from "vitest";

const st = { rows: new Map<string, { email: string; note?: string }>(), recent: 0, fail: false, upserts: [] as unknown[] };
vi.mock("@/lib/db", () => ({
  db: () => ({
    from: () => ({
      select: () => ({ gte: async () => ({ count: st.recent, error: null }) }),
      upsert: async (row: { email: string; note?: string }, opts: { ignoreDuplicates?: boolean }) => {
        if (st.fail) return { error: { message: "db down" } };
        st.upserts.push(opts);
        if (!(opts.ignoreDuplicates && st.rows.has(row.email))) st.rows.set(row.email, row);
        return { error: null };
      },
    }),
  }),
}));

const ask = async (body: unknown) => (await import("../../app/api/invite-requests/route")).POST(new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => { st.rows = new Map(); st.recent = 0; st.fail = false; st.upserts = []; vi.spyOn(console, "error").mockImplementation(() => undefined); });

describe("POST /api/invite-requests", () => {
  it("saves a request, with the email normalised and the note tidied", async () => {
    const res = await ask({ email: "  New@Example.com ", note: "  I ride   3 times\na week " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(st.rows.get("new@example.com")).toEqual({ email: "new@example.com", note: "I ride 3 times a week" });
  });
  it("asking twice is fine and never overwrites the first request", async () => {
    await ask({ email: "a@example.com", note: "first" });
    const again = await ask({ email: "a@example.com", note: "second" });
    expect(again.status).toBe(200);
    expect(st.rows.get("a@example.com")?.note).toBe("first");
  });
  it("a bot that fills the hidden field gets a success and nothing is saved", async () => {
    const res = await ask({ email: "bot@example.com", website: "http://spam.example" });
    expect(await res.json()).toEqual({ ok: true });
    expect(st.rows.size).toBe(0);
  });
  it("refuses a bad email or body", async () => {
    expect((await ask({ email: "nope" })).status).toBe(400);
    expect((await ask({})).status).toBe(400);
    expect((await ask("{oops")).status).toBe(400);
  });
  it("stops a flood: past the hourly cap it says to try later and saves nothing", async () => {
    st.recent = 40;
    const res = await ask({ email: "late@example.com" });
    expect(res.status).toBe(429);
    expect(st.rows.size).toBe(0);
  });
  it("still thanks the person if the database hiccups, and never logs the address", async () => {
    st.fail = true;
    const res = await ask({ email: "someone@example.com" });
    expect(res.status).toBe(200);
    for (const a of (console.error as ReturnType<typeof vi.fn>).mock.calls) expect(JSON.stringify(a)).not.toContain("someone@example.com");
  });
});
