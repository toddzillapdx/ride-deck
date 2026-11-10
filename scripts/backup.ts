/**
 * Dumps the four RideDeck tables to a timestamped JSON file in /backup/ (gitignored: it holds your rides).
 * Supabase's free tier has no automatic backups, so run this before the cutover and now and then after.
 *
 *   npx tsx scripts/backup.ts --schema public
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnv, schemaArg, supabaseFor } from "./lib";

loadEnv();

async function dump(client: ReturnType<typeof supabaseFor>, table: string, order: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select("*").order(order).range(from, from + 999);
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

async function main() {
  const schema = schemaArg("env");
  const client = supabaseFor(schema);
  const out = {
    exportedAt: new Date().toISOString(), schema,
    rides: await dump(client, "rides", "id"), ride_logs: await dump(client, "ride_logs", "id"),
    songs: await dump(client, "songs", "key"), app_settings: await dump(client, "app_settings", "key"),
  };
  mkdirSync("backup", { recursive: true });
  const file = `backup/ridedeck-supabase-${schema}-${out.exportedAt.replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`Wrote ${file}: ${out.rides.length} rides, ${out.ride_logs.length} history rows, ${out.songs.length} songs, ${out.app_settings.length} settings.`);
}

main().catch((e) => { console.error(`\nFailed: ${(e as Error).message}`); process.exit(1); });
