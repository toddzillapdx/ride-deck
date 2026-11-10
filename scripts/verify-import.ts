/**
 * Checks an import. Prints counts and ids only.
 *
 *   npx tsx scripts/verify-import.ts --schema preview [--from-backup <file>]
 *
 * - every row the import would write is present in Supabase (counts and ids)
 * - every ride's JSON still reads and validates
 * - every history row points at a ride or a starter ride
 * - a converted copy hides its original in the library
 */
import { buildPlan, recsFromBackup, type AtRec, type Source } from "./importMap";
import { airtableCalls, airtableList, arg, loadEnv, schemaArg, supabaseFor } from "./lib";
import { listRides } from "../src/lib/db/rides";
import { readRide, validateRide } from "../src/lib/engine";
import { isPresetId } from "../src/lib/presets";
import { readFileSync } from "node:fs";

loadEnv();

async function all(client: ReturnType<typeof supabaseFor>, table: string, order: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select("*").order(order).range(from, from + 999);
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

async function main() {
  const schema = schemaArg("preview");
  const backup = arg("from-backup");
  let src: Source;
  if (backup) {
    const b = JSON.parse(readFileSync(backup, "utf8")) as { rides?: unknown; rideLog?: unknown; settingsRow?: unknown };
    src = { rides: [...recsFromBackup(b.rides), ...(b.settingsRow ? recsFromBackup([b.settingsRow]) : [])], ridesV2: [], logs: recsFromBackup(b.rideLog), songs: [] };
  } else {
    const get = async (t: string): Promise<AtRec[]> => (await airtableList(t)) ?? [];
    src = { rides: await get("Rides"), ridesV2: schema === "preview" ? await get("RidesV2") : [], logs: schema === "public" ? await get("RideLog") : [], songs: await get("Songs") };
    console.log(`Airtable calls used: ${airtableCalls.n}`);
  }
  const plan = buildPlan(schema, src);
  const client = supabaseFor(schema);
  const [rides, logs, songs, settings] = await Promise.all([all(client, "rides", "id"), all(client, "ride_logs", "id"), all(client, "songs", "key"), all(client, "app_settings", "key")]);

  let bad = 0;
  const check = (label: string, ok: boolean, detail = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`); if (!ok) bad++; };
  const missing = (want: { id?: string; key?: string }[], have: Record<string, unknown>[], k: "id" | "key") => { const h = new Set(have.map((r) => r[k])); return want.filter((w) => !h.has(w[k] as string)).map((w) => w[k] as string); };

  const mr = missing(plan.rides, rides, "id");
  check(`rides: ${plan.rides.length} expected, ${rides.length} in "${schema}"`, mr.length === 0, mr.length ? `missing ids ${mr.join(", ")}` : "");
  const ml = missing(plan.logs, logs, "id");
  check(`ride_logs: ${plan.logs.length} expected, ${logs.length} in "${schema}"`, ml.length === 0, ml.length ? `missing ids ${ml.join(", ")}` : "");
  const ms = missing(plan.songs, songs, "key");
  check(`songs: ${plan.songs.length} expected, ${songs.length} in "${schema}"`, ms.length === 0, ms.length ? `${ms.length} missing` : "");
  check(`app_settings: ${plan.settings ? "expected 1" : "none expected"}, ${settings.length} found`, !plan.settings || settings.some((s) => s.key === "main"));

  const unreadable: string[] = [];
  const warned: string[] = [];
  for (const r of rides) {
    try {
      const o = (typeof r.workout === "string" ? JSON.parse(r.workout) : r.workout) as Record<string, unknown>;
      const ride = readRide({ ...o, id: r.id }).ride;
      if (validateRide(ride).length) warned.push(String(r.id));
    } catch { unreadable.push(String(r.id)); }
  }
  check("every ride reads (readRide)", unreadable.length === 0, unreadable.length ? `unreadable ids ${unreadable.join(", ")}` : "");
  if (warned.length) console.log(`NOTE ${warned.length} ride(s) read but have soft validation warnings (they can still be ridden): ${warned.join(", ")}`);

  const known = new Set(rides.map((r) => String(r.id)));
  const orphans = [...new Set(logs.map((l) => l.ride_id).filter((x): x is string => typeof x === "string" && !!x && !known.has(x) && !isPresetId(x)))];
  check("every history row points at a ride or a starter ride", orphans.length === 0, orphans.length ? `ride ids not found (ride was deleted?): ${orphans.join(", ")}` : "");

  const { rides: shown, skipped } = await listRides(client);
  const copies = rides.filter((r) => typeof (r.workout as { sourceId?: unknown })?.sourceId === "string");
  const stillShown = copies.map((c) => (c.workout as { sourceId: string }).sourceId).filter((orig) => known.has(orig) && shown.some((s) => s.id === orig));
  check(`converted copies hide their originals (${copies.length} copies)`, stillShown.length === 0, stillShown.length ? `originals still listed: ${stillShown.join(", ")}` : "");
  check(`library lists ${shown.length} of ${rides.length} rides`, skipped.length === 0, skipped.length ? `unreadable by the library: ${skipped.join(", ")}` : "");

  console.log(bad ? `\n${bad} check(s) failed.` : "\nAll checks passed.");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(`\nFailed: ${(e as Error).message}`); process.exit(1); });
