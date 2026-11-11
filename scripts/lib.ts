/** Shared by the maintenance scripts (backup). Runs on a local machine, never on Vercel. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Loads .env.local (gitignored) if present. Never prints values. */
export function loadEnv() {
  try { (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env.local"); } catch { /* no .env.local: use the real environment */ }
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function need(...names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const missing = names.filter((n) => !(out[n] = process.env[n] ?? ""));
  if (missing.length) { console.error(`Missing environment variable(s): ${missing.join(", ")}. Put them in .env.local (gitignored). Values are never printed.`); process.exit(1); }
  return out;
}

export function supabaseFor(schema: string): SupabaseClient {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = need("SUPABASE_URL", "SUPABASE_SECRET_KEY");
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema } }) as unknown as SupabaseClient;
}

export function schemaArg(fallback: "preview" | "public" | "env" = "preview"): "preview" | "public" {
  const s = arg("schema") ?? (fallback === "env" ? process.env.SUPABASE_DB_SCHEMA || "public" : fallback);
  if (s !== "preview" && s !== "public") { console.error('--schema must be "preview" or "public"'); process.exit(1); }
  return s;
}
