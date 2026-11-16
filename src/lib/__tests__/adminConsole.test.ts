import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "../db/__tests__/fakeDb";

// ---- stand-ins: a signed-in person, a pretend is_admin() answer, the service client (in-memory tables + an auth admin) ----------
type U = { id: string; email: string; created_at: string; last_sign_in_at: string | null; banned_until: string | null };
const ME = { id: "aaaaaaaa-0000-4000-8000-00000000000a", email: "boss@example.com" };
const R1 = "bbbbbbbb-0000-4000-8000-00000000000b", R2 = "cccccccc-0000-4000-8000-00000000000c";
const st = {
  user: ME as { id: string; email: string } | null, admin: true,
  fake: new FakeDb(), users: [] as U[], updates: [] as { id: string; attrs: unknown }[],
};
vi.mock("@/lib/auth/config", () => ({ authConfigured: () => true, authUrl: () => "u", authKey: () => "k" }));
vi.mock("@/lib/auth/server", () => ({
  serverAuthClient: () => ({
    auth: { getUser: async () => (st.user ? { data: { user: st.user }, error: null } : { data: { user: null }, error: { message: "no session" } }) },
    rpc: async (name: string) => (name === "is_admin" ? { data: st.admin, error: null } : { data: null, error: null }),
    from: () => { throw new Error("the console must use the service client, never the signed-in one, for other people's data"); },
  }),
}));
vi.mock("@/lib/db/client", async (orig) => ({
  ...(await orig<typeof import("@/lib/db/client")>()),
  db: () => ({
    from: (t: string) => st.fake.from(t),
    auth: { admin: {
      listUsers: async () => ({ data: { users: st.users }, error: null }),
      getUserById: async (id: string) => { const u = st.users.find((x) => x.id === id); return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: "not found" } }; },
      updateUserById: async (id: string, attrs: unknown) => { st.updates.push({ id, attrs }); return { data: {}, error: null }; },
    } },
  }),
}));

const post = async (body: unknown) => (await import("../../app/api/admin/users/route")).POST(new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const consoleGet = async () => (await import("../../app/api/admin/console/route")).GET();
const table = (n: string) => st.fake.table(n);
const NOW_ISO = new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

beforeEach(() => {
  st.user = ME; st.admin = true; st.updates = [];
  st.fake = new FakeDb();
  st.users = [
    { id: ME.id, email: "boss@example.com", created_at: daysAgo(30), last_sign_in_at: daysAgo(0), banned_until: null },
    { id: R1, email: "rider1@example.com", created_at: daysAgo(10), last_sign_in_at: daysAgo(9), banned_until: null },
    { id: R2, email: "rider2@example.com", created_at: daysAgo(5), last_sign_in_at: daysAgo(4), banned_until: new Date(Date.now() + 86400_000 * 30).toISOString() },
  ];
  st.fake.seed("admins", [{ email: "boss@example.com" }]);
  st.fake.seed("invites", [
    { email: "boss@example.com", note: "owner", exempt: true, created_at: daysAgo(30) },
    { email: "rider1@example.com", note: "approved", exempt: false, created_at: daysAgo(11) },
    { email: "rider2@example.com", note: "approved", exempt: false, created_at: daysAgo(6) },
    { email: "waiting@gmal.com", note: "added by admin", exempt: false, created_at: daysAgo(1) },
  ]);
  st.fake.seed("invite_requests", [
    { email: "new1@example.com", note: "I ride a Peloton", status: "new", created_at: daysAgo(2) },
    { email: "gone@example.com", note: null, status: "declined", created_at: daysAgo(3) },
    { email: "rider1@example.com", note: null, status: "invited", created_at: daysAgo(12) },
  ]);
  st.fake.seed("ride_logs", [{ user_id: R1, started_at: daysAgo(2) }, { user_id: R1, started_at: daysAgo(6) }, { user_id: ME.id, started_at: daysAgo(1) }]);
  st.fake.seed("app_settings", [{ user_id: R1, key: "main", value: { hiddenPresets: [], service: "spotify" } }]);
  delete process.env.RESEND_API_KEY;
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("only the admin gets in", () => {
  it("a rider gets 403 on the console and on every action, and nothing changes", async () => {
    st.admin = false;
    const before = JSON.stringify([...st.fake.tables.entries()]);
    expect((await consoleGet()).status).toBe(403);
    for (const body of [{ action: "add_invite", email: "x@example.com" }, { action: "approve_request", email: "new1@example.com" }, { action: "remove_invite", email: "waiting@gmal.com" }, { action: "disable_rider", userId: R1 }, { action: "set_exempt", email: "rider1@example.com", exempt: true }, { action: "send_invite_email", email: "waiting@gmal.com" }]) {
      expect((await post(body)).status).toBe(403);
    }
    expect(JSON.stringify([...st.fake.tables.entries()])).toBe(before);
    expect(st.updates).toEqual([]);
  });
  it("signed-out visitors get 'sign in'", async () => {
    st.user = null;
    expect((await consoleGet()).status).toBe(401);
    expect((await post({ action: "add_invite", email: "x@example.com" })).status).toBe(401);
  });
});

describe("the console", () => {
  it("shows new requests, invites waiting, riders with their state, and counts", async () => {
    const body = await (await consoleGet()).json();
    expect(body.requests.map((r: { email: string }) => r.email).sort()).toEqual(["gone@example.com", "new1@example.com", "rider1@example.com"]);
    expect(body.invites.map((i: { email: string }) => i.email)).toEqual(["waiting@gmail.com".replace("gmail", "gmal")]); // only people with no account yet
    expect(body.invites[0].suggestion).toBe("waiting@gmail.com"); // typo help
    const by = (e: string) => body.riders.find((r: { email: string }) => r.email === e);
    expect(by("rider1@example.com")).toMatchObject({ rideCount: 2, service: "spotify", exempt: false, disabled: false, isAdmin: false, isYou: false });
    expect(by("rider2@example.com")).toMatchObject({ disabled: true });
    expect(by("boss@example.com")).toMatchObject({ isAdmin: true, isYou: true, exempt: true, rideCount: 1 });
    expect(body.counts).toEqual({ newRequests: 1, waiting: 1, active: 2, disabled: 1 }); // boss + rider1 rode in the last 7 days; rider2 is disabled
    expect(body.emailConfigured).toBe(false);
  });
});

describe("approving and inviting", () => {
  it("approving a request adds them to the invite list, marks the request, and writes the log", async () => {
    const res = await post({ action: "approve_request", email: "New1@Example.com" });
    expect(res.status).toBe(200);
    expect(table("invites").find((i) => i.email === "new1@example.com")).toMatchObject({ exempt: false });
    expect(table("invite_requests").find((r) => r.email === "new1@example.com")!.status).toBe("invited");
    expect(table("admin_log")).toMatchObject([{ admin_email: "boss@example.com", action: "approve", target: "new1@example.com" }]);
  });
  it("can approve without the weekly planner limit", async () => {
    await post({ action: "approve_request", email: "new1@example.com", exempt: true });
    expect(table("invites").find((i) => i.email === "new1@example.com")!.exempt).toBe(true);
  });
  it("approving a request that does not exist is a 404", async () => {
    expect((await post({ action: "approve_request", email: "nobody@example.com" })).status).toBe(404);
  });
  it("adding an invite directly works once, and again is harmless", async () => {
    const first = await (await post({ action: "add_invite", email: " Friend@Example.com ", note: "my sister" })).json();
    expect(first.message).toMatch(/friend@example.com is invited/);
    expect(table("invites").find((i) => i.email === "friend@example.com")).toMatchObject({ note: "my sister" });
    const again = await (await post({ action: "add_invite", email: "friend@example.com" })).json();
    expect(again.message).toMatch(/already on the invite list/);
    expect(table("invites").filter((i) => i.email === "friend@example.com")).toHaveLength(1);
  });
  it("junk is refused before anything is written", async () => {
    for (const body of [{ action: "add_invite", email: "nope" }, { action: "add_invite" }, { action: "approve_request", email: "" }, { action: "bogus", email: "a@example.com" }, { action: "disable_rider", userId: "not-a-uuid" }, {}]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(table("admin_log")).toHaveLength(0);
  });
  it("decline and reopen change the request's status", async () => {
    await post({ action: "decline_request", email: "new1@example.com" });
    expect(table("invite_requests").find((r) => r.email === "new1@example.com")!.status).toBe("declined");
    await post({ action: "reopen_request", email: "new1@example.com" });
    expect(table("invite_requests").find((r) => r.email === "new1@example.com")!.status).toBe("new");
    expect((await post({ action: "decline_request", email: "nobody@example.com" })).status).toBe(404);
  });
  it("exempt can be switched on and off; for someone not invited it is a 404", async () => {
    await post({ action: "set_exempt", email: "rider1@example.com", exempt: true });
    expect(table("invites").find((i) => i.email === "rider1@example.com")!.exempt).toBe(true);
    await post({ action: "set_exempt", email: "rider1@example.com", exempt: false });
    expect(table("invites").find((i) => i.email === "rider1@example.com")!.exempt).toBe(false);
    expect((await post({ action: "set_exempt", email: "nobody@example.com", exempt: true })).status).toBe(404);
  });
});

describe("the invitation email", () => {
  it("without a Resend key, approving still works and hands back a mail link to send it yourself", async () => {
    const res = await (await post({ action: "approve_request", email: "new1@example.com", notify: true })).json();
    expect(res.email).toMatchObject({ to: "new1@example.com", sent: false, reason: "not-configured" });
    expect(decodeURIComponent(res.email.mailto)).toContain("8-digit code");
    expect(table("invites").some((i) => i.email === "new1@example.com")).toBe(true);
  });
  it("with a Resend key it sends one email to that person from the RideDeck address", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const res = await (await post({ action: "approve_request", email: "new1@example.com", notify: true })).json();
    expect(res.email).toEqual({ to: "new1@example.com", sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ to: ["new1@example.com"], from: expect.stringContaining("ridedeck.app") });
    expect(sent.subject).toMatch(/You're in/);
    expect(JSON.stringify(res)).not.toContain("re_test"); // the key never goes back to the browser
  });
  it("a failed send is reported, with the mail link as a fallback, and does not undo the approval", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: "domain not verified" }) }));
    const res = await (await post({ action: "approve_request", email: "new1@example.com", notify: true })).json();
    expect(res.email).toMatchObject({ sent: false, reason: "failed", detail: "domain not verified" });
    expect(res.email.mailto).toContain("mailto:");
    expect(table("invites").some((i) => i.email === "new1@example.com")).toBe(true);
  });
  it("sending again to someone on the invite list works; to someone not on it is a 404", async () => {
    expect((await (await post({ action: "send_invite_email", email: "waiting@gmal.com" })).json()).email.sent).toBe(false);
    expect((await post({ action: "send_invite_email", email: "stranger@example.com" })).status).toBe(404);
  });
});

describe("removing an invite", () => {
  it("removes someone who has not signed up, and marks their request declined", async () => {
    st.fake.seed("invite_requests", [{ email: "waiting@gmal.com", note: null, status: "invited", created_at: daysAgo(1) }]);
    const res = await post({ action: "remove_invite", email: "waiting@gmal.com" });
    expect(res.status).toBe(200);
    expect(table("invites").some((i) => i.email === "waiting@gmal.com")).toBe(false);
    expect(table("invite_requests").find((r) => r.email === "waiting@gmal.com")!.status).toBe("declined");
  });
  it("refuses when the person already has an account (disable them instead) or is an admin", async () => {
    const a = await post({ action: "remove_invite", email: "rider1@example.com" });
    expect(a.status).toBe(400);
    expect((await a.json()).error).toMatch(/Disable the rider/);
    expect((await post({ action: "remove_invite", email: "boss@example.com" })).status).toBe(400);
    expect(table("invites").some((i) => i.email === "rider1@example.com")).toBe(true);
  });
});

describe("disabling riders", () => {
  it("disable blocks sign-in with a long ban; enable lifts it", async () => {
    expect((await post({ action: "disable_rider", userId: R1 })).status).toBe(200);
    expect(st.updates).toEqual([{ id: R1, attrs: { ban_duration: "876000h" } }]);
    expect((await post({ action: "enable_rider", userId: R2 })).status).toBe(200);
    expect(st.updates[1]).toEqual({ id: R2, attrs: { ban_duration: "none" } });
    expect(table("admin_log").map((l) => l.action)).toEqual(["disable rider", "enable rider"]);
  });
  it("cannot disable yourself or another admin", async () => {
    expect((await post({ action: "disable_rider", userId: ME.id })).status).toBe(400);
    st.users.push({ id: "dddddddd-0000-4000-8000-00000000000d", email: "second@example.com", created_at: daysAgo(1), last_sign_in_at: null, banned_until: null });
    st.fake.seed("admins", [{ email: "second@example.com" }]);
    const res = await post({ action: "disable_rider", userId: "dddddddd-0000-4000-8000-00000000000d" });
    expect(res.status).toBe(400);
    expect(st.updates).toEqual([]);
  });
  it("a rider that does not exist is a 404", async () => {
    expect((await post({ action: "disable_rider", userId: "eeeeeeee-0000-4000-8000-00000000000e" })).status).toBe(404);
  });
});
