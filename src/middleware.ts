import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideAccess } from "@/lib/auth/access";

/**
 * Accounts on: keeps a signed-in person's session fresh, and sends signed-out visitors to the welcome page (at "/") or to
 * the sign-in page (everywhere else). Accounts off (no sign-in settings): does nothing, so the app is exactly as before.
 * The data routes check the session themselves.
 */
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  let signedIn = false;
  if (req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    try { signedIn = !!(await supabase.auth.getUser()).data.user; } catch { signedIn = false; }
  }

  const { pathname, search } = req.nextUrl;
  const verdict = decideAccess(pathname, search, signedIn, true);
  if (verdict.action === "next") return res;
  const target = new URL(verdict.to, req.url);
  const out = verdict.action === "rewrite" ? NextResponse.rewrite(target) : NextResponse.redirect(target);
  res.cookies.getAll().forEach((c) => out.cookies.set(c)); // keep a refreshed session
  return out;
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|icons|manifest.webmanifest|favicon.ico).*)"] };
