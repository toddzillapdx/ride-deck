import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authConfigured, authKey, authUrl } from "./config";

let client: SupabaseClient | null = null;

/** The sign-in client for the browser. Null when accounts are not set up. Keeps the session in cookies, so it survives the home screen app. */
export function browserClient(): SupabaseClient | null {
  if (!authConfigured()) return null;
  return (client ??= createBrowserClient(authUrl(), authKey()) as unknown as SupabaseClient);
}
