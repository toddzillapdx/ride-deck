import { beforeEach, describe, expect, it, vi } from "vitest";
import { limitResets, quotaLine } from "../songClient";

// ---- stand-ins: accounts on, a pretend signed-in person, a pretend planner, a pretend database ------------------------
const st = {
  accountsOn: true, user: { id: "u1", email: "friend@example.com" } as { id: string; email: string } | null,
  quota: { allowed: true, used: 1, limit: 5, remaining: 4, resets_at: "2026-11-20T10:00:00Z", exempt: false } as Record<string, unknown>,
  rpcError: null as { message: string } | null, planner: vi.fn(), rpc: vi.fn(), tableCalls: [] as string[], passcode: "",
};
vi.mock("@/lib/auth/config", () => ({ authConfigured: () => st.accountsOn, authUrl: () => "u", authKey: () => "k" }));
vi.mock("@/lib/auth/server", () => ({
  serverAuthClient: () => ({
    auth: { getUser: async () => (st.user ? { data: { user: st.user }, error: null } : { data: { user: null }, error: { message: "no session" } }) },
    rpc: (...a: unknown[]) => st.rpc(...a),
    from: (t: string) => { st.tableCalls.push(t); return { select: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }), eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }; },
  }),
}));
vi.mock("@/lib/db/client", async (orig) => ({ ...(await orig<typeof import("@/lib/db/client")>()), db: () => { throw new Error("the shared server key must not be used for a signed-in request"); } }));
vi.mock("@anthropic-ai/sdk", () => { class A { static AuthenticationError = class extends Error {}; static RateLimitError = class extends Error {}; static APIError = class extends Error {}; } return { default: A }; });
vi.mock("@/lib/songPlanner", () => ({ planSongs: (...a: unknown[]) => st.planner(...a) }));

const plan = (body: Record<string, unknown> = {}) =>
  import("../../app/api/music/songs/route").then(({ POST }) => POST(new Request("http://x/api/music/songs", { method: "POST", headers: st.passcode ? { "x-planner-passcode": st.passcode } : {}, body: JSON.stringify({ vibe: "Classic", targetMin: 30, count: 12, ...body }) })));

beforeEach(() => {
  st.accountsOn = true; st.user = { id: "u1", email: "friend@example.com" }; st.passcode = "";
  st.quota = { allowed: true, used: 1, limit: 5, remaining: 4, resets_at: "2026-11-20T10:00:00Z", exempt: false };
  st.rpc = vi.fn(async (name: string) => (name === "consume_quota" ? { data: st.quota, error: st.rpcError } : { data: null, error: null }));
  st.planner = vi.fn().mockResolvedValue({ songs: [{ title: "T", artist: "A", intensity: 5 }], notes: [] });
  st.tableCalls = [];
  process.env.ANTHROPIC_API_KEY = "test"; delete process.env.PLANNER_PASSCODE; delete process.env.PLAN_WEEKLY_LIMIT; delete process.env.SWAP_WEEKLY_LIMIT;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("data routes with accounts on", () => {
  it("refuse a signed-out request with a 'sign in' answer the app understands", async () => {
    st.user = null;
    const { GET } = await import("../../app/api/rides/route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "signin", rides: [] });
    const h = await import("../../app/api/history/route");
    expect((await h.GET()).status).toBe(401);
    const s = await import("../../app/api/settings/route");
    expect((await s.GET()).status).toBe(401);
  });
  it("use the signed-in person's own client, never the shared server key", async () => {
    const { GET } = await import("../../app/api/rides/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(st.tableCalls).toContain("rides");
  });
  it("the starter rides need sign-in too", async () => {
    st.user = null;
    const { GET } = await import("../../app/api/rides/[id]/route");
    expect((await GET(new Request("http://x"), { params: { id: "preset-hiit-20" } })).status).toBe(401);
    st.user = { id: "u1", email: "friend@example.com" };
    expect((await GET(new Request("http://x"), { params: { id: "preset-hiit-20" } })).status).toBe(200);
  });
});

describe("the song planner with weekly limits", () => {
  it("needs a signed-in person, and does not ask for the old shared passcode", async () => {
    st.user = null;
    expect((await plan()).status).toBe(401);
    expect(st.planner).not.toHaveBeenCalled();
    st.user = { id: "u1", email: "friend@example.com" };
    process.env.PLANNER_PASSCODE = "secret"; // ignored with accounts on
    expect((await plan()).status).toBe(200);
  });
  it("a full plan takes one plan use (limit 5), a one-song swap takes a swap use (limit 30)", async () => {
    await plan();
    expect(st.rpc).toHaveBeenCalledWith("consume_quota", { p_kind: "plan", p_limit: 5 });
    st.rpc.mockClear();
    await plan({ slot: { index: 2, total: 9 }, count: undefined });
    expect(st.rpc).toHaveBeenCalledWith("consume_quota", { p_kind: "swap", p_limit: 30 });
  });
  it("the limits can be changed without a code change", async () => {
    process.env.PLAN_WEEKLY_LIMIT = "3"; process.env.SWAP_WEEKLY_LIMIT = "12";
    await plan();
    expect(st.rpc).toHaveBeenCalledWith("consume_quota", { p_kind: "plan", p_limit: 3 });
  });
  it("past the limit: a 429 that says when more come back, and the planner is never called", async () => {
    st.quota = { allowed: false, used: 5, limit: 5, remaining: 0, resets_at: "2026-11-20T10:00:00Z", exempt: false };
    const res = await plan();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "limit", kind: "plan", limit: 5, resets_at: "2026-11-20T10:00:00Z" });
    expect(st.planner).not.toHaveBeenCalled();
  });
  it("gives the use back when the planner fails", async () => {
    st.planner = vi.fn().mockRejectedValue(new Error("boom"));
    const res = await plan();
    expect(res.status).toBe(502);
    expect(st.rpc).toHaveBeenCalledWith("refund_quota", { p_kind: "plan" });
  });
  it("does not run the planner if the limit check itself breaks", async () => {
    st.rpcError = { message: "db down" }; st.rpc = vi.fn(async () => ({ data: null, error: st.rpcError }));
    expect((await plan()).status).toBe(502);
    expect(st.planner).not.toHaveBeenCalled();
    st.rpcError = null;
  });
  it("with accounts off it behaves as before: the shared passcode, no limits", async () => {
    st.accountsOn = false; process.env.PLANNER_PASSCODE = "secret";
    expect((await plan()).status).toBe(401);
    st.passcode = "secret";
    expect((await plan()).status).toBe(200);
    expect(st.rpc).not.toHaveBeenCalled();
  });
});

describe("the weekly-plans line", () => {
  it("counts down, says when it is used up, and says nothing for the owner", () => {
    expect(quotaLine({ used: 2, limit: 5, remaining: 3, resets_at: null, exempt: false })?.text).toBe("3 plans left this week");
    expect(quotaLine({ used: 4, limit: 5, remaining: 1, resets_at: null, exempt: false })?.text).toBe("1 plan left this week");
    const out = quotaLine({ used: 5, limit: 5, remaining: 0, resets_at: new Date(Date.now() + 3 * 86400_000).toISOString(), exempt: false });
    expect(out?.out).toBe(true);
    expect(out?.text).toMatch(/^No plans left this week\. You get another on /);
    expect(quotaLine({ used: 9, limit: 5, remaining: null, resets_at: null, exempt: true })).toBeNull();
    expect(quotaLine(undefined)).toBeNull();
  });
  it("describes when more come back, even when the time is missing", () => {
    expect(limitResets(undefined)).toMatch(/over the next week/);
    expect(limitResets(new Date(Date.now() + 3600_000).toISOString())).toBe("You get another later today.");
  });
});
