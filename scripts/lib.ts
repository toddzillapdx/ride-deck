/** Shared by the migration scripts. Runs on Todd's machine, never on Vercel. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Loads .env.local (gitignored) if present. Never prints values. */
export function loadEnv() {
  try { (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env.local"); } catch { /* no .env.local: use the real environment */ }
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
export const flag = (name: string) => process.argv.includes(`--${name}`);

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

/** Read-only Airtable list. Counts calls so the monthly budget is visible. */
export const airtableCalls = { n: 0 };
export async function airtableList(table: string): Promise<{ id: string; fields: Record<string, unknown> }[] | null> {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = need("AIRTABLE_TOKEN", "AIRTABLE_BASE_ID");
  const out: { id: string; fields: Record<string, unknown> }[] = [];
  let offset: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: "100" });
    if (offset) q.set("offset", offset);
    airtableCalls.n++;
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${q}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    if (res.status === 404 || res.status === 422) return null; // the table does not exist
    if (res.status === 429) throw new Error("Airtable answered 429 (monthly call limit). Use --from-backup <file>, or wait for the monthly reset on the 1st (UTC).");
    if (!res.ok) throw new Error(`Airtable ${res.status} reading ${table}`);
    const page = (await res.json()) as { records: { id: string; fields: Record<string, unknown> }[]; offset?: string };
    out.push(...page.records);
    offset = page.offset;
  } while (offset);
  return out;
}

export async function upsertBatches(client: SupabaseClient, table: string, rows: object[], onConflict: string, size = 100): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await client.from(table).upsert(rows.slice(i, i + size), { onConflict });
    if (error) throw new Error(`Upsert into ${table} failed: ${error.message}`);
  }
}
