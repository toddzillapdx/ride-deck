import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTP_LENGTH, cleanCode, isCompleteCode, isPlausibleEmail, normalizeEmail, safeNext } from "../email";

describe("sign-in form helpers", () => {
  it("normalizes email: trims and lowercases, and ignores non-strings", () => {
    expect(normalizeEmail("  Todd@Example.COM ")).toBe("todd@example.com");
    expect(normalizeEmail(42)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });
  it("catches obvious typos", () => {
    for (const ok of ["a@b.co", "first.last+tag@sub.example.app"]) expect(isPlausibleEmail(ok)).toBe(true);
    for (const bad of ["", "a", "a@b", "a@b.c", "a b@c.com", "@c.com", "a@@c.com", "x".repeat(250) + "@c.com"]) expect(isPlausibleEmail(bad)).toBe(false);
  });
  it("takes a code however it was typed or pasted", () => {
    expect(cleanCode("123456")).toBe("123456");
    expect(cleanCode(" 1234 5678 ")).toBe("12345678");
    expect(cleanCode("1234-5678")).toBe("12345678");
    expect(cleanCode("123456789012")).toBe("1234567890"); // never cut down to a shorter, wrong code
    expect(cleanCode("abc")).toBe("");
    for (const ok of ["123456", "12345678", "1234567890"]) expect(isCompleteCode(ok)).toBe(true);
    for (const bad of ["12345", "12345a", "", "12345678901"]) expect(isCompleteCode(bad)).toBe(false);
    expect(OTP_LENGTH).toBe(8); // the length Supabase sends unless changed
  });
  it("only ever redirects inside the app after sign-in", () => {
    expect(safeNext("/builder/new")).toBe("/builder/new");
    expect(safeNext("/ride/abc?speed=1")).toBe("/ride/abc?speed=1");
    for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "evil", "javascript:alert(1)"]) expect(safeNext(bad as string)).toBe("/");
  });
});

// ---- the request-code route, with the database and the sign-in service stood in --------------------------------
const state = { invited: new Set<string>(), otp: vi.fn(), authOn: true, dbError: false };
vi.mock("@/lib/auth/config", () => ({ authConfigured: () => state.authOn, authUrl: () => "u", authKey: () => "k" }));
vi.mock("@/lib/auth/server", () => ({ serverAuthClient: () => ({ auth: { signInWithOtp: state.otp } }) }));
vi.mock("@/lib/db", () => ({
  db: () => ({ from: () => ({ select: () => ({ eq: (_c: string, email: string) => ({ maybeSingle: async () => { if (state.dbError) throw new Error("db down"); return { data: state.invited.has(email) ? { email } : null }; } }) }) }) }),
}));

const call = async (body: unknown) => {
  const { POST } = await import("../../../app/api/auth/request-code/route");
  return POST(new Request("http://x/api/auth/request-code", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
};

describe("POST /api/auth/request-code", () => {
  beforeEach(() => { state.invited = new Set(["friend@example.com"]); state.otp = vi.fn().mockResolvedValue({ error: null }); state.authOn = true; state.dbError = false; vi.spyOn(console, "error").mockImplementation(() => undefined); });

  it("emails a code to someone on the invite list, creating their account on first sign-in", async () => {
    const res = await call({ email: "  Friend@Example.com " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.otp).toHaveBeenCalledTimes(1);
    expect(state.otp).toHaveBeenCalledWith({ email: "friend@example.com", options: { shouldCreateUser: true } });
  });

  it("answers exactly the same for someone not invited, and sends nothing", async () => {
    const yes = await (await call({ email: "friend@example.com" })).json();
    state.otp.mockClear();
    const no = await call({ email: "stranger@example.com" });
    expect(no.status).toBe(200);
    expect(await no.json()).toEqual(yes);
    expect(state.otp).not.toHaveBeenCalled();
  }, 10000);

  it("does not leak a failure either: the answer is the same if sending the code fails", async () => {
    state.otp = vi.fn().mockResolvedValue({ error: { message: "rate limited" } });
    const res = await call({ email: "friend@example.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("still answers the same if the database is down, and sends nothing", async () => {
    state.dbError = true;
    const res = await call({ email: "friend@example.com" });
    expect(res.status).toBe(200);
    expect(state.otp).not.toHaveBeenCalled();
  });

  it("refuses a malformed email or body", async () => {
    expect((await call({ email: "nope" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect((await call("{not json")).status).toBe(400);
    expect(state.otp).not.toHaveBeenCalled();
  });

  it("says so plainly when accounts are not set up on this deployment", async () => {
    state.authOn = false;
    expect((await call({ email: "friend@example.com" })).status).toBe(503);
    expect(state.otp).not.toHaveBeenCalled();
  });

  it("never writes the email address to the logs", async () => {
    state.otp = vi.fn().mockResolvedValue({ error: { message: "failed" } });
    await call({ email: "friend@example.com" });
    for (const args of (console.error as ReturnType<typeof vi.fn>).mock.calls) expect(JSON.stringify(args)).not.toContain("friend@example.com");
  });
});
