/**
 * Converts the v1 rides in /backup/ to schema v2 and prints a review table. Writes JSON to /converted/.
 * Reads local files only. It NEVER talks to Airtable; nothing is saved anywhere until Todd approves the table.
 *
 *   npx tsx scripts/convert-v1-rides.ts [backup-file]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { convertV1, rideDuration, validateRide, type SprintMode, type V1Workout } from "../src/lib/engine";

const root = path.resolve(__dirname, "..");
const backupDir = path.join(root, "backup");
const outDir = path.join(root, "converted");
const file = process.argv[2] ?? path.join(backupDir, readdirSync(backupDir).filter((f) => f.endsWith(".json")).sort().pop()!);

const backup = JSON.parse(readFileSync(file, "utf8")) as { rides: { id: string; Name: string; WorkoutJson: V1Workout; PlaylistUrl?: string }[] };
mkdirSync(outDir, { recursive: true });

const MODES: SprintMode[] = ["30/30", "40/20"];
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n - 1) + "~" : s + " ".repeat(n - s.length));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

const lines: string[] = [];
const md: string[] = ["# V1 to V2 review table", "", `Source: ${path.basename(file)}. Nothing here has been written to Airtable.`, ""];

for (const r of backup.rides) {
  const w: V1Workout = { ...r.WorkoutJson, id: r.id, name: r.Name || r.WorkoutJson.name, ...(r.PlaylistUrl ? { playlistUrl: r.PlaylistUrl } : {}) };
  const results = Object.fromEntries(MODES.map((m) => [m, convertV1(w, { sprint: m })])) as Record<SprintMode, ReturnType<typeof convertV1>>;
  const main = results["30/30"];
  const oldTotal = w.segments.reduce((t, s) => t + s.durationSec, 0);

  for (const m of MODES) {
    const slug = m.replace("/", "-");
    writeFileSync(path.join(outDir, `${r.id}.sprints-${slug}.json`), JSON.stringify(results[m].ride, null, 2));
  }

  const head = `${r.Name}  [${r.id}]  old ${clock(oldTotal)} -> new ${clock(rideDuration(main.ride))}`;
  lines.push("", head, "-".repeat(head.length));
  md.push(`## ${r.Name}`, "", `\`${r.id}\` · old ${clock(oldTotal)} → new ${clock(rideDuration(main.ride))}`, "", "| # | Segment | Old (v1) | New (v2, sprints 30/30) | If sprints 40/20 | Flags |", "|---|---|---|---|---|---|");
  main.rows.forEach((row, i) => {
    const alt = results["40/20"].rows[i];
    const same = alt.new === row.new;
    lines.push(`${pad(String(i + 1), 3)}${pad(row.name, 14)}${pad(row.old, 34)}${pad(row.new, 52)}${same ? "" : "  | 40/20: " + alt.new}`);
    for (const f of row.flags) lines.push(`      ! ${f}`);
    md.push(`| ${i + 1} | ${row.name} | ${row.old} | ${row.new} | ${same ? "same" : alt.new} | ${row.flags.join("; ")} |`);
  });
  const warns = validateRide(main.ride).map((x) => x.message);
  if (warns.length) { lines.push(...warns.map((x) => `      ? ${x}`)); md.push("", ...warns.map((x) => `- Warning: ${x}`)); }
  md.push("");
}

writeFileSync(path.join(outDir, "review-table.md"), md.join("\n"));
console.log(lines.join("\n"));
console.log(`\nWrote ${backup.rides.length * 2} converted ride files and review-table.md to ${path.relative(root, outDir)}/ (gitignored). Nothing was written to Airtable.`);
