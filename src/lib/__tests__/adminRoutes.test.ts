import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESETS } from "@/lib/presets";

// ---- stand-ins: accounts on, a pretend signed-in person, and a pretend is_admin() answer --------------------------------
const st = {
  accountsOn: true,
  user: { id: "u1", email: "rider@example.com" } as { id: string; email: string } | null,
  admin: false as boolean | null,
  adminError: null as { message: string } | null,
  planner: vi.fn(),
  writes: [] as string[],
};
vi.mock("@/lib/auth/config", () => ({ authConfigured: () => st.accountsOn, authUrl: () => "u", authKey: () => "k" }));
vi.mock("@/lib/auth/server", () => ({
  serverAuthClient: () => ({
    auth: { getUser: async () => (st.user ? { data: { user: st.user }, error: null } : { data: { user: null }, error: { message: "no session" } }) },
    rpc: async (name: string) => {
      if (name === "is_admin") return { data: st.adminError ? null : st.admin, error: st.adminError };
      if (name === "consume_quota") return { data: { allowed: true, used: 1, limit: 5, remaining: 4, resets_at: null, exempt: false }, error: null };
      return { data: null, error: null };
    },
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const op of ["insert", "update", "upsert", "delete"]) q[op] = () => { st.writes.push(`${op} ${t}`); return q; };
      q.select = () => q; q.eq = () => q; q.single = async () => ({ data: null, error: { message: "stop" } });
      q.maybeSingle = async () => ({ data: null, error: null });
      q.then = (res: (v: unknown) => void) => res({ data: [], error: null });
      return q;
    },
  }),
}));
vi.mock("@/lib/db/client", async (orig) => ({ ...(await orig<typeof import("@/lib/db/client")>()), db: () => { throw new Error("the shared server key must not be used for a signed-in request"); } }));
vi.mock("@anthropic-ai/sdk", () => { class A { static AuthenticationError = class extends Error {}; static RateLimitError = class extends Error {}; static APIError = class extends Error {}; } return { default: A }; });
vi.mock("@/lib/songPlanner", () => ({ planSongs: (...a: unknown[]) => st.planner(...a) }));

const json = (method: string, body: unknown = {}) => new Request("http://x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const { id: _id, ...validRide } = PRESETS[0]; // a real, valid ride body, so the answer comes from the guard and not from body checks
void _id;

/** Every route that builds, edits or plans. A rider must be refused on all of them. */
const guarded: [string, () => Promise<Response>][] = [
  ["POST /api/rides", async () => (await import("../../app/api/rides/route")).POST(json("POST", validRide))],
  ["PUT /api/rides/[id]", async () => (await import("../../app/api/rides/[id]/route")).PUT(json("PUT", validRide), { params: { id: "r1" } })],
  ["PATCH /api/rides/[id]", async () => (await import("../../app/api/rides/[id]/route")).PATCH(json("PATCH", { playlistUrl: "https://x.example/p" }), { params: { id: "r1" } })],
  ["DELETE /api/rides/[id]", async () => (await import("../../app/api/rides/[id]/route")).DELETE(json("DELETE"), { params: { id: "r1" } })],
  ["POST /api/music/songs", async () => (await import("../../app/api/music/songs/route")).POST(json("POST", { vibe: "Classic", targetMin: 30, count: 12 }))],
  ["POST /api/songs/resolve", async () => (await import("../../app/api/songs/resolve/route")).POST(json("POST", { songs: [{ artist: "A", title: "T" }] }))],
];

beforeEach(() => {
  st.accountsOn = true; st.user = { id: "u1", email: "rider@example.com" }; st.admin = false; st.adminError = null; st.writes = [];
  st.planner = vi.fn().mockResolvedValue({ songs: [{ title: "T", artist: "A", intensity: 5 }], notes: [] });
  process.env.ANTHROPIC_API_KEY = "test";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("admin-only routes", () => {
  for (const [name, call] of guarded) {
    it(`${name}: a signed-in rider gets 403 and nothing is written or planned`, async () => {
      const res = await call();
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: "admin" });
      expect(st.writes).toEqual([]);
      expect(st.planner).not.toHaveBeenCalled();
    });
    it(`${name}: a signed-out visitor gets the 'sign in' answer, not 'admin'`, async () => {
      st.user = null;
      const res = await call();
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: "signin" });
    });
    it(`${name}: if the admin check itself fails, nobody gets through`, async () => {
      st.admin = true; st.adminError = { message: "boom" };
      const res = await call();
      expect(res.status).toBe(502);
      expect(st.writes).toEqual([]);
      expect(st.planner).not.toHaveBeenCalled();
    });
  }

  it("the admin is let through to the planner and to ride writes", async () => {
    st.admin = true;
    const plan = await guarded.find(([n]) => n === "POST /api/music/songs")![1]();
    expect(plan.status).toBe(200);
    expect(st.planner).toHaveBeenCalled();
    await guarded.find(([n]) => n === "DELETE /api/rides/[id]")![1]();
    expect(st.writes).toContain("delete rides");
  });
});

describe("what riders can still do", () => {
  it("read a ride, to ride it", async () => {
    const r = await import("../../app/api/rides/[id]/route");
    expect((await r.GET(new Request("http://x"), { params: { id: "preset-hiit-20" } })).status).toBe(200);
  });
});

describe("/api/me", () => {
  it("says whether the signed-in person is the admin", async () => {
    const { GET } = await import("../../app/api/me/route");
    expect(await (await GET()).json()).toMatchObject({ accounts: true, signedIn: true, admin: false, email: "rider@example.com" });
    st.admin = true;
    expect(await (await GET()).json()).toMatchObject({ admin: true });
  });
  it("answers 401 when signed out", async () => {
    st.user = null;
    const { GET } = await import("../../app/api/me/route");
    expect((await GET()).status).toBe(401);
  });
  it("with accounts off the app is a single-person tool: admin", async () => {
    st.accountsOn = false;
    const { GET } = await import("../../app/api/me/route");
    expect(await (await GET()).json()).toMatchObject({ accounts: false, admin: true });
  });
});
