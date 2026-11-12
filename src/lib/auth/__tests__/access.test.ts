import { describe, expect, it } from "vitest";
import { decideAccess } from "../access";

describe("who sees which page", () => {
  it("accounts off: nothing changes, anywhere", () => {
    for (const p of ["/", "/builder/new", "/ride/abc", "/history", "/login", "/welcome"]) expect(decideAccess(p, "", false, false)).toEqual({ action: "next" });
  });
  it("signed out: the main address shows the welcome page (the address stays /)", () => {
    expect(decideAccess("/", "", false, true)).toEqual({ action: "rewrite", to: "/welcome" });
  });
  it("signed out: login and welcome are open", () => {
    expect(decideAccess("/login", "?next=%2F", false, true)).toEqual({ action: "next" });
    expect(decideAccess("/welcome", "", false, true)).toEqual({ action: "next" });
  });
  it("signed out: everything else goes to sign-in and comes back afterwards", () => {
    expect(decideAccess("/history", "", false, true)).toEqual({ action: "redirect", to: "/login?next=%2Fhistory" });
    expect(decideAccess("/ride/preset-hiit-20", "?speed=30", false, true)).toEqual({ action: "redirect", to: "/login?next=%2Fride%2Fpreset-hiit-20%3Fspeed%3D30" });
    expect(decideAccess("/builder/new", "", false, true).action).toBe("redirect");
    expect(decideAccess("/music", "", false, true).action).toBe("redirect"); // the old music page too: no page is left open by accident
  });
  it("signed in: all pages open, and the welcome page just goes to the library", () => {
    for (const p of ["/", "/builder/new", "/ride/abc", "/history", "/login"]) expect(decideAccess(p, "", true, true)).toEqual({ action: "next" });
    expect(decideAccess("/welcome", "", true, true)).toEqual({ action: "redirect", to: "/" });
  });
});
