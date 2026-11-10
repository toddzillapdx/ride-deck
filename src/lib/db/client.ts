// Server-side only. The secret key must never reach the browser, so never import this from a client component.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Supabase is not set up (missing URL or key). Routes answer 503. */
export class NotConfigured extends Error {}
/** The row does not exist. Routes answer 404. */
export class NotFound extends Error {}

export const dbConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

/** The schema this deploy reads and writes: "preview" on Vercel previews, "public" (production) when unset. */
export const dbSchema = () => process.env.SUPABASE_DB_SCHEMA?.trim() || "public";

/** The project address only: https://xxxx.supabase.co. A pasted .../rest/v1/ (or any path) is trimmed. */
export function cleanUrl(raw: string): string {
  try { return new URL(raw.trim()).origin; } catch { return raw.trim(); }
}

let cache: { sig: string; client: SupabaseClient } | null = null;

/** The one client for this process. Throws NotConfigured when the env vars are missing. */
export function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new NotConfigured("SUPABASE_URL and SUPABASE_SECRET_KEY are not set");
  const schema = dbSchema();
  const sig = `${url}|${schema}|${key.length}`;
  if (cache?.sig === sig) return cache.client;
  const client = createClient(cleanUrl(url), key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema } }) as unknown as SupabaseClient;
  cache = { sig, client };
  return client;
}

/** What a query returns. Throws on a database error so routes can answer 502. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database: ${res.error.message}`);
  return res.data;
}
