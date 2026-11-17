import { describe, expect, it } from "vitest";
import { countsOf, inviteMailto, inviteMessage, isActiveRider, suggestEmail, type ConsoleRider } from "../console";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const rider = (o: Partial<ConsoleRider>): ConsoleRider => ({ id: "u", email: "a@example.com", joinedAt: "2026-11-01T00:00:00Z", lastSignInAt: null, lastRideAt: null, rideCount: 0, service: null, disabled: false, isAdmin: false, isYou: false, ...o });

describe("who counts as active", () => {
  it("rode or signed in within the last 7 days, and is not disabled", () => {
    expect(isActiveRider(rider({ lastRideAt: "2026-11-15T00:00:00Z" }), NOW)).toBe(true);
    expect(isActiveRider(rider({ lastSignInAt: "2026-11-14T00:00:00Z" }), NOW)).toBe(true);
    expect(isActiveRider(rider({ lastRideAt: "2026-11-10T00:00:00Z", lastSignInAt: "2026-11-01T00:00:00Z" }), NOW)).toBe(false);
    expect(isActiveRider(rider({}), NOW)).toBe(false);
    expect(isActiveRider(rider({ lastRideAt: "2026-11-19T00:00:00Z", disabled: true }), NOW)).toBe(false);
  });
  it("counts requests, waiting invites, active and disabled riders", () => {
    const c = countsOf(
      [{ email: "a@x.co", note: null, status: "new", createdAt: "", suggestion: null }, { email: "b@x.co", note: null, status: "declined", createdAt: "", suggestion: null }],
      [{ email: "c@x.co", note: null, createdAt: "", suggestion: null }],
      [rider({ lastRideAt: "2026-11-19T00:00:00Z" }), rider({ disabled: true }), rider({})], NOW);
    expect(c).toEqual({ newRequests: 1, waiting: 1, active: 1, disabled: 1 });
  });
});

describe("typo help for email addresses", () => {
  it("suggests the well-known provider one or two slips away", () => {
    expect(suggestEmail("todd@gmal.com")).toBe("todd@gmail.com");
    expect(suggestEmail("todd@ail.com")).toBe("todd@gmail.com"); // "gm" lost from gmail.com: a mistake that really happened
    expect(suggestEmail("pat@gmail.con")).toBe("pat@gmail.com");
    expect(suggestEmail("pat@hotmial.com")).toBe("pat@hotmail.com");
    expect(suggestEmail("pat@yaho.com")).toBe("pat@yahoo.com");
    expect(suggestEmail("pat@iclod.com")).toBe("pat@icloud.com");
  });
  it("says nothing for a correct provider, a company address, or junk", () => {
    expect(suggestEmail("pat@gmail.com")).toBeNull();
    expect(suggestEmail("pat@acme-widgets.com")).toBeNull();
    expect(suggestEmail("pat@university.edu")).toBeNull();
    expect(suggestEmail("pat@gm.com")).toBeNull(); // too far from gmail.com to guess
    expect(suggestEmail("pat@we.com")).toBe("pat@me.com"); // one slip from a short provider is still caught
    expect(suggestEmail("pat@weekly-news.com")).toBeNull();
    expect(suggestEmail("not an email")).toBeNull();
    expect(suggestEmail("")).toBeNull();
  });
  it("keeps the part before the @ exactly as typed (lowercased)", () => {
    expect(suggestEmail("Pat.Smith+beta@gmal.com")).toBe("pat.smith+beta@gmail.com");
  });
});

describe("the invitation email", () => {
  it("tells them where to go and what to do, with the site address", () => {
    const m = inviteMessage("https://ridedeck.app");
    expect(m.subject).toMatch(/You're in/);
    for (const part of ["https://ridedeck.app", "8-digit code", "Add to Home Screen", "reply"]) expect(m.text).toContain(part);
    expect(m.html).toContain('href="https://ridedeck.app"');
  });
  it("the mail link opens a message to that person with the text filled in", () => {
    const link = inviteMailto("pat@example.com", "https://ridedeck.app");
    expect(link.startsWith("mailto:pat%40example.com?subject=")).toBe(true);
    expect(decodeURIComponent(link)).toContain("https://ridedeck.app");
  });
});
