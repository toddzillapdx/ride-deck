/**
 * Copies RideDeck data from Airtable (read-only) into Supabase. Run locally, never on Vercel:
 *
 *   npx tsx scripts/import-airtable.ts --schema preview --dry-run
 *   npx tsx scripts/import-airtable.ts --schema preview
 *   npx tsx scripts/import-airtable.ts --schema public            (cutover)
 *
 * --from-backup <file>  read rides, history and settings from a local backup JSON instead of calling Airtable (no Songs).
 * Re-running is safe (upserts by id / key). Prints counts and ids only: never ride contents or secrets.
 */
import { AtRec, buildPlan, recsFromBackup, type Source } from "./importMap";
import { airtableCalls, airtableList, arg, flag, loadEnv, schemaArg, supabaseFor, upsertBatches } from "./lib";
import { readFileSync } from "node:fs";

loadEnv();

async function main() {
  const schema = schemaArg("preview");
  const dry = flag("dry-run");
  const backup = arg("from-backup");

  let src: Source;
  if (backup) {
    const b = JSON.parse(readFileSync(backup, "utf8")) as { rides?: unknown; rideLog?: unknown; settingsRow?: unknown };
    const settings = b.settingsRow ? recsFromBackup([b.settingsRow]) : [];
    src = { rides: [...recsFromBackup(b.rides), ...settings], ridesV2: [], logs: recsFromBackup(b.rideLog), songs: [] };
    console.log(`Source: backup file (no Airtable calls). Songs are not in a backup, so the song cache starts empty.`);
  } else {
    const get = async (t: string): Promise<AtRec[]> => (await airtableList(t)) ?? [];
    // Only read what this schema needs: fewer calls against the monthly limit.
    src = {
      rides: await get("Rides"),
      ridesV2: schema === "preview" ? await get("RidesV2") : [],
      logs: schema === "public" ? await get("RideLog") : [],
      songs: await get("Songs"),
    };
    console.log(`Source: Airtable, read-only. Calls used: ${airtableCalls.n}.`);
  }

  const plan = buildPlan(schema, src);
  console.log(`\nTarget schema: ${schema}${dry ? "  (dry run: nothing is written)" : ""}`);
  console.log(`  rides:        ${plan.rides.length}`);
  console.log(`  ride_logs:    ${plan.logs.length}${schema === "preview" ? "  (preview history starts empty, on purpose)" : ""}`);
  console.log(`  songs:        ${plan.songs.length}`);
  console.log(`  app_settings: ${plan.settings ? `1 (${plan.settings.hiddenPresets.length} hidden starter ride(s))` : "none found"}`);
  if (plan.skipped.length) {
    console.log(`\nSkipped ${plan.skipped.length} record(s) that could not be mapped:`);
    for (const s of plan.skipped) console.log(`  ${s.table} ${s.id}: ${s.reason}`);
  }
  if (dry) { console.log("\nDry run done."); return; }

  const client = supabaseFor(schema);
  await upsertBatches(client, "rides", plan.rides, "id");
  await upsertBatches(client, "ride_logs", plan.logs, "id");
  await upsertBatches(client, "songs", plan.songs, "key");
  if (plan.settings) await upsertBatches(client, "app_settings", [{ key: "main", value: plan.settings, updated_at: new Date().toISOString() }], "key");
  console.log(`\nImported into "${schema}". Now run: npx tsx scripts/verify-import.ts --schema ${schema}${backup ? ` --from-backup ${backup}` : ""}`);
}

main().catch((e) => { console.error(`\nFailed: ${(e as Error).message}`); process.exit(1); });
