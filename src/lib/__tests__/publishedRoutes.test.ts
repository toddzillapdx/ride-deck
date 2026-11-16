import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "../db/__tests__/fakeDb";
import { PRESETS } from "../presets";
import { PRESETS_V2 } from "../presetsV2";
import { isCuratedId, curatedId, curatedUuid as curatedUuidOf } from "../db/curated";
import { ACTIVE_SERVICES, SERVICES, isHttpsUrl, linkWarning, missingServices, serviceOfUrl } from "../services";

// ---- stand-ins: accounts on, a pretend signed-in person, a pretend admin answer, an in-memory database ----------------------
const st = { user: { id: "u1", email: "rider@example.com" } as { id: string; email: string } | null, admin: false, fake: new FakeDb() };
vi.mock("@/lib/auth/config", () => ({ authConfigured: () => true, authUrl: () => "u", authKey: () => "k" }));
vi.mock("@/lib/auth/server", () => ({
  serverAuthClient: () => ({
    auth: { getUser: async () => (st.user ? { data: { user: st.user }, error: null } : { data: { user: null }, error: { message: "no session" } }) },
    rpc: async (name: string) => (name === "is_admin" ? { data: st.admin, error: null } : { data: null, error: null }),
    from: (t: string) => st.fake.from(t),
  }),
}));
vi.mock("@/lib/db/client", async (orig) => ({ ...(await orig<typeof import("@/lib/db/client")>()), db: () => { throw new Error("the shared server key must not be used for a signed-in request"); } }));

const UUID_LIVE = "11111111-1111-4111-8111-111111111111";
const UUID_DRAFT = "22222222-2222-4222-8222-222222222222";
const LIVE = curatedId(UUID_LIVE), DRAFT = curatedId(UUID_DRAFT);
const URLS = { spotify: "https://open.spotify.com/playlist/a", apple: "https://music.apple.com/us/playlist/a", amazon: "https://music.amazon.com/playlists/a" };
const { id: _i, ...ride } = PRESETS[0];
void _i;
const { id: _v2id, ...v2 } = PRESETS_V2[0];
void _v2id;
const storedRide = { ...v2, name: "Hills and Hooks" };

const call = async (route: string, method: string, body?: unknown, params?: Record<string, string>) => {
  const mod = await import(`../../app/api/${route}/route`);
  return mod[method](new Request("http://x/api", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), { params });
};

function seed() {
  st.fake = new FakeDb();
  st.fake.seed("curated_rides", [
    { id: UUID_LIVE, title: "Hills and Hooks", blurb: "Four climbs", month: "2027-01", ride: storedRide, total_seconds: 600, status: "published", published_at: "2027-01-02T00:00:00Z" },
    { id: UUID_DRAFT, title: "Work in progress", blurb: null, month: null, ride: storedRide, total_seconds: 600, status: "draft" },
  ]);
  st.fake.seed("curated_playlists", [
    { ride_id: UUID_LIVE, service: "spotify", url: URLS.spotify }, { ride_id: UUID_LIVE, service: "apple", url: URLS.apple }, { ride_id: UUID_LIVE, service: "amazon", url: URLS.amazon },
    { ride_id: UUID_DRAFT, service: "spotify", url: URLS.spotify },
  ]);
  st.fake.seed("app_settings", [{ key: "main", value: { hiddenPresets: [], service: "amazon" } }]);
}
beforeEach(() => { st.user = { id: "u1", email: "rider@example.com" }; st.admin = false; seed(); vi.spyOn(console, "error").mockImplementation(() => undefined); });

describe("riders see published rides only", () => {
  it("the library list has the published ride with the link for the rider's service, and not the draft", async () => {
    const res = await call("curated", "GET");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rides.map((r: { id: string }) => r.id)).toEqual([LIVE]);
    expect(body.rides[0].workout.playlistUrl).toBe(URLS.amazon);
    expect(body.rides[0].services).toEqual(["spotify", "apple", "amazon"]);
    expect(body.service).toBe("amazon");
  });
  it("the ride screen loads a published ride with the rider's playlist link", async () => {
    const res = await call("rides/[id]", "GET", undefined, { id: LIVE });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Hills and Hooks");
    const raw = await (await (await import("../../app/api/rides/[id]/route")).GET(new Request("http://x/api?format=raw"), { params: { id: LIVE } })).json();
    expect(raw.playlistUrl).toBe(URLS.amazon);
    expect(raw.id).toBe(LIVE);
  });
  it("a rider only sees rides that have a playlist on their service", async () => {
    const SPOTIFY_ONLY = "44444444-4444-4444-8444-444444444444";
    st.fake.seed("curated_rides", [{ id: SPOTIFY_ONLY, title: "Spotify only", blurb: null, month: null, ride: storedRide, total_seconds: 600, status: "published", published_at: "2027-01-03T00:00:00Z" }]);
    st.fake.seed("curated_playlists", [{ ride_id: SPOTIFY_ONLY, service: "spotify", url: URLS.spotify }]);
    const ids = async () => (await (await call("curated", "GET")).json()).rides.map((r: { id: string }) => r.id).sort();
    st.fake.table("app_settings")[0].value = { hiddenPresets: [], service: "amazon" };
    expect(await ids()).toEqual([LIVE]);
    st.fake.table("app_settings")[0].value = { hiddenPresets: [], service: "spotify" };
    expect(await ids()).toEqual([LIVE, curatedId(SPOTIFY_ONLY)].sort());
  });
  it("a rider asking for a draft gets 404, the same as for a ride that does not exist", async () => {
    expect((await call("rides/[id]", "GET", undefined, { id: DRAFT })).status).toBe(404);
    expect((await call("rides/[id]", "GET", undefined, { id: curatedId("33333333-3333-4333-8333-333333333333") })).status).toBe(404);
  });
  it("the admin can open a draft (to test it before publishing)", async () => {
    st.admin = true;
    expect((await call("rides/[id]", "GET", undefined, { id: DRAFT })).status).toBe(200);
  });
  it("without a service chosen there is no playlist link yet", async () => {
    st.fake.table("app_settings")[0].value = { hiddenPresets: [] };
    const body = await (await call("curated", "GET")).json();
    expect(body.service).toBeNull();
    expect(body.rides[0].workout.playlistUrl).toBeUndefined();
  });
  it("signed-out visitors get 'sign in'", async () => {
    st.user = null;
    expect((await call("curated", "GET")).status).toBe(401);
    expect((await call("rides/[id]", "GET", undefined, { id: LIVE })).status).toBe(401);
  });
  it("nobody can change or delete a published ride through the ordinary ride routes", async () => {
    st.admin = true;
    expect((await call("rides/[id]", "PUT", ride, { id: LIVE })).status).toBe(403);
    expect((await call("rides/[id]", "DELETE", undefined, { id: LIVE })).status).toBe(403);
    expect((await call("rides/[id]", "PATCH", { playlistUrl: URLS.spotify }, { id: LIVE })).status).toBe(403);
  });
});

describe("admin management", () => {
  it("riders get 403 on every admin curated route and nothing changes", async () => {
    const before = JSON.stringify([...st.fake.table("curated_rides"), ...st.fake.table("curated_playlists")]);
    expect((await call("admin/curated", "GET")).status).toBe(403);
    expect((await call("admin/curated", "POST", { rideId: "abc" })).status).toBe(403);
    expect((await call("admin/curated/[id]", "GET", undefined, { id: DRAFT })).status).toBe(403);
    expect((await call("admin/curated/[id]", "PATCH", { status: "published" }, { id: DRAFT })).status).toBe(403);
    expect((await call("admin/curated/[id]", "DELETE", undefined, { id: DRAFT })).status).toBe(403);
    expect(JSON.stringify([...st.fake.table("curated_rides"), ...st.fake.table("curated_playlists")])).toBe(before);
  });
  it("the admin sees drafts and what each is missing", async () => {
    st.admin = true;
    const { rides } = await (await call("admin/curated", "GET")).json();
    expect(rides).toHaveLength(2);
    const draft = rides.find((r: { id: string }) => r.id === DRAFT);
    expect(draft.status).toBe("draft");
    expect(draft.missing).toEqual(["amazon"]);
    expect(rides.find((r: { id: string }) => r.id === LIVE).missing).toEqual([]);
  });
  it("publishing without all three links is refused with a plain message, and nothing changes", async () => {
    st.admin = true;
    const res = await call("admin/curated/[id]", "PATCH", { status: "published" }, { id: DRAFT });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Add a playlist link for Amazon Music before publishing/);
    expect(st.fake.table("curated_rides").find((r) => r.id === UUID_DRAFT)!.status).toBe("draft");
  });
  it("adding the missing link and publishing in one request works (Apple Music is not needed)", async () => {
    st.admin = true;
    const res = await call("admin/curated/[id]", "PATCH", { links: { amazon: URLS.amazon }, status: "published" }, { id: DRAFT });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "published", missing: [] });
    expect(st.fake.table("curated_playlists").filter((p) => p.ride_id === UUID_DRAFT)).toHaveLength(2);
  });
  it("a live ride cannot lose the link for a service that is switched on", async () => {
    st.admin = true;
    const res = await call("admin/curated/[id]", "PATCH", { links: { amazon: "" } }, { id: LIVE });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/A live ride needs a Amazon Music link/);
    expect(st.fake.table("curated_playlists").some((p) => p.ride_id === UUID_LIVE && p.service === "amazon")).toBe(true);
    // a link can be replaced, and the switched-off service can be dropped
    expect((await call("admin/curated/[id]", "PATCH", { links: { amazon: "https://music.amazon.com/new" } }, { id: LIVE })).status).toBe(200);
    expect((await call("admin/curated/[id]", "PATCH", { links: { apple: "" } }, { id: LIVE })).status).toBe(200);
  });
  it("a link that is not a full https address is refused before anything is saved", async () => {
    st.admin = true;
    for (const bad of ["http://music.apple.com/x", "javascript:alert(1)", "https://music apple.com", "not a link"]) {
      expect((await call("admin/curated/[id]", "PATCH", { links: { apple: bad } }, { id: DRAFT })).status).toBe(400);
    }
    expect(st.fake.table("curated_playlists").filter((p) => p.ride_id === UUID_DRAFT)).toHaveLength(1);
  });
  it("title, blurb and month are validated; month and blurb can be cleared", async () => {
    st.admin = true;
    expect((await call("admin/curated/[id]", "PATCH", { title: "   " }, { id: DRAFT })).status).toBe(400);
    expect((await call("admin/curated/[id]", "PATCH", { month: "January" }, { id: DRAFT })).status).toBe(400);
    const res = await call("admin/curated/[id]", "PATCH", { title: "New name", blurb: "Hi", month: "2027-02" }, { id: DRAFT });
    expect(await res.json()).toMatchObject({ title: "New name", blurb: "Hi", month: "2027-02" });
    const cleared = await call("admin/curated/[id]", "PATCH", { blurb: null, month: "" }, { id: DRAFT });
    expect(await cleared.json()).toMatchObject({ blurb: null, month: null });
  });
  it("a draft can be deleted; ids that are not published-ride ids are 404", async () => {
    st.admin = true;
    expect((await call("admin/curated/[id]", "DELETE", undefined, { id: DRAFT })).status).toBe(200);
    expect(st.fake.table("curated_rides")).toHaveLength(1);
    expect((await call("admin/curated/[id]", "GET", undefined, { id: "not-an-id" })).status).toBe(404);
  });
  it("turning a saved ride into a draft copies it and strips the id", async () => {
    st.admin = true;
    st.fake.seed("rides", [{ id: "99999999-9999-4999-8999-999999999999", name: "My ride", playlist_url: null, workout: { ...storedRide, name: "My ride" }, total_seconds: 600 }]);
    const res = await call("admin/curated", "POST", { rideId: "99999999-9999-4999-8999-999999999999" });
    expect(res.status).toBe(201);
    const made = await res.json();
    expect(isCuratedId(made.id)).toBe(true);
    expect(made).toMatchObject({ title: "My ride", status: "draft", links: {} });
    const stored = st.fake.table("curated_rides").find((r) => r.title === "My ride")!;
    expect(JSON.stringify(stored.ride)).not.toMatch(/"id"|playlistUrl/);
    expect((await call("admin/curated", "POST", { rideId: LIVE })).status).toBe(400);
  });
  it("the playlist link saved on a ride comes across, filed under the service it belongs to", async () => {
    st.admin = true;
    const make = async (url: string | null) => {
      st.fake.seed("rides", [{ id: "99999999-9999-4999-8999-999999999999", name: "Linked", playlist_url: url, workout: { ...storedRide, name: "Linked" }, total_seconds: 600 }]);
      const made = await (await call("admin/curated", "POST", { rideId: "99999999-9999-4999-8999-999999999999" })).json();
      st.fake.tables.set("rides", []);
      return made;
    };
    expect((await make(URLS.amazon)).links).toEqual({ amazon: URLS.amazon });
    expect((await make(URLS.spotify)).links).toEqual({ spotify: URLS.spotify });
    expect((await make(URLS.apple)).links).toEqual({ apple: URLS.apple }); // kept even though Apple is switched off
    expect((await make("https://example.com/some-playlist")).links).toEqual({}); // not a known service: pasted by hand in the editor
    expect((await make(null)).links).toEqual({});
    const made = await make(URLS.amazon);
    expect(made.missing).toEqual(["spotify"]); // Spotify is still needed to publish
    expect(st.fake.table("curated_playlists").filter((p) => p.ride_id === curatedUuidOf(made.id) && p.service === "amazon")).toHaveLength(1);
  });
  it("a new version of a published ride starts with its links", async () => {
    st.admin = true;
    const res = await call("admin/curated", "POST", { copyOf: LIVE });
    expect(res.status).toBe(201);
    const made = await res.json();
    expect(made).toMatchObject({ title: "Hills and Hooks (new version)", status: "draft", links: URLS, missing: [] });
    expect(made.id).not.toBe(LIVE);
  });
  it("riders cannot make a draft from a published ride either", async () => {
    expect((await call("admin/curated", "POST", { copyOf: LIVE })).status).toBe(403);
  });
});

describe("the rider's music service", () => {
  it("is saved without losing the hidden starter rides, and the other way round", async () => {
    st.fake.table("app_settings")[0].value = { hiddenPresets: [PRESETS[0].id], service: null };
    let b = await (await call("settings", "PUT", { service: "spotify" })).json();
    expect(b).toMatchObject({ hiddenPresets: [PRESETS[0].id], service: "spotify" });
    b = await (await call("settings", "PUT", { hiddenPresets: [] })).json();
    expect(b).toMatchObject({ hiddenPresets: [], service: "spotify" });
    b = await (await call("settings", "PUT", { service: null })).json();
    expect(b.service).toBeNull();
  });
  it("only the switched-on services are accepted", async () => {
    expect((await call("settings", "PUT", { service: "tidal" })).status).toBe(400);
    expect((await call("settings", "PUT", { service: "apple" })).status).toBe(400); // built, but switched off
    expect((await call("settings", "PUT", {})).status).toBe(400);
  });
});

describe("events", () => {
  it("records the kind, the ride and the rider's service", async () => {
    const res = await call("events", "POST", { rideId: LIVE, kind: "playlist_opened" });
    expect(res.status).toBe(200);
    expect(st.fake.table("ride_events")).toEqual([{ ride_id: LIVE, kind: "playlist_opened", service: "amazon" }]);
  });
  it("refuses junk and needs a signed-in rider", async () => {
    expect((await call("events", "POST", { rideId: LIVE, kind: "hacked" })).status).toBe(400);
    expect((await call("events", "POST", { rideId: "", kind: "opened" })).status).toBe(400);
    expect((await call("events", "POST", { rideId: "x".repeat(81), kind: "opened" })).status).toBe(400);
    st.user = null;
    expect((await call("events", "POST", { rideId: LIVE, kind: "opened" })).status).toBe(401);
    expect(st.fake.table("ride_events")).toHaveLength(0);
  });
});

describe("links and services", () => {
  it("knows which service a link belongs to", () => {
    expect(serviceOfUrl(URLS.spotify)).toBe("spotify");
    expect(serviceOfUrl("https://open.spotify.com/playlist/x?si=1")).toBe("spotify");
    expect(serviceOfUrl(URLS.apple)).toBe("apple");
    expect(serviceOfUrl(URLS.amazon)).toBe("amazon");
    expect(serviceOfUrl("https://www.amazon.com/music/player/playlists/x")).toBe("amazon");
    expect(serviceOfUrl("https://amzn.to/abc")).toBe("amazon");
    expect(serviceOfUrl("https://example.com/x")).toBeNull();
    expect(serviceOfUrl("nope")).toBeNull();
  });
  it("warns when a link is in the wrong box, but not when it is right or empty", () => {
    expect(linkWarning("apple", URLS.apple)).toBeNull();
    expect(linkWarning("apple", "")).toBeNull();
    expect(linkWarning("apple", URLS.spotify)).toMatch(/looks like a Spotify link, not Apple Music/);
    expect(linkWarning("apple", "https://example.com/x")).toMatch(/doesn't look like a Apple Music link/);
    expect(linkWarning("apple", "http://music.apple.com/x")).toMatch(/full https/);
  });
  it("publishing needs a link for every switched-on service, https only", () => {
    expect([...ACTIVE_SERVICES]).toEqual(["spotify", "amazon"]);
    expect(SERVICES).toContain("apple"); // still known, just not required
    expect(missingServices({})).toEqual(["spotify", "amazon"]);
    expect(missingServices({ spotify: URLS.spotify, apple: URLS.apple, amazon: "http://x" })).toEqual(["amazon"]);
    expect(missingServices({ spotify: URLS.spotify, amazon: URLS.amazon })).toEqual([]);
    expect(isHttpsUrl("https://a.example/x y")).toBe(false);
  });
  it("only real published-ride ids are recognised", () => {
    expect(isCuratedId(LIVE)).toBe(true);
    for (const bad of ["pub-123", "pub-", "preset-hiit-20", UUID_LIVE, `${LIVE}x`]) expect(isCuratedId(bad)).toBe(false);
  });
});
