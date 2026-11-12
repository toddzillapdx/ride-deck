// Server-side only (route handlers and server components).
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { authConfigured, authKey, authUrl } from "./config";

/** A client that acts as the signed-in person (their cookies), with the browser-safe key. Null when accounts are not set up. */
export function serverAuthClient(): SupabaseClient | null {
  if (!authConfigured()) return null;
  const jar = cookies();
  return createServerClient(authUrl(), authKey(), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        // Server components cannot set cookies; route handlers can. The middleware refreshes sessions either way.
        try { list.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* ignore */ }
      },
    },
  }) as unknown as SupabaseClient;
}
