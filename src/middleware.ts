import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps a signed-in person's session fresh. It does nothing unless accounts are set up AND the visitor already has a
 * session cookie, so signed-out visitors and today's app are untouched. It never blocks a page.
 */
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  if (!req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))) return NextResponse.next();

  let res = NextResponse.next({ request: req });
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
  try { await supabase.auth.getUser(); } catch { /* a failed refresh just leaves the person signed out */ }
  return res;
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|icons|manifest.webmanifest|favicon.ico).*)"] };
