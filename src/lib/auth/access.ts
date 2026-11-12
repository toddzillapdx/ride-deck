/** Who may see which page. Pure, so it can be tested. Used by the middleware. */
export type Access = { action: "next" } | { action: "rewrite"; to: string } | { action: "redirect"; to: string };

/** Pages anyone can open. Everything else needs a signed-in person (when accounts are on). */
export const PUBLIC_PAGES = ["/login", "/welcome"];

export function decideAccess(pathname: string, search: string, signedIn: boolean, accountsOn: boolean): Access {
  if (!accountsOn) return { action: "next" };
  if (signedIn) return pathname === "/welcome" ? { action: "redirect", to: "/" } : { action: "next" };
  if (pathname === "/") return { action: "rewrite", to: "/welcome" }; // signed-out visitors get the welcome page at the main address
  if (PUBLIC_PAGES.includes(pathname)) return { action: "next" };
  return { action: "redirect", to: `/login?next=${encodeURIComponent(pathname + search)}` };
}
