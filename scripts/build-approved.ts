/**
 * Builds the rides Todd approved from the review table. Local files only; writes /converted/approved/ (gitignored).
 * Decisions (2026-11-07): sprint blocks become 30/30 intervals; the 2:00 "Breathe" sprint in the 90's Hip Hop ride
 * becomes a Recover; the 80's Punk HIIT ride is NOT converted (rebuilt by hand later).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { convertV1, parseRideV2, rideDuration, validateRide, type V1Workout } from "../src/lib/engine";

const root = path.resolve(__dirname, "..");
const file = path.join(root, "backup", readdirSync(path.join(root, "backup")).filter((f) => f.endsWith(".json")).sort().pop()!);
const backup = JSON.parse(readFileSync(file, "utf8")) as { rides: { id: string; Name: string; PlaylistUrl?: string; WorkoutJson: V1Workout }[] };

const SKIP = new Set(["rec9kOesn3j4y7N3f"]); // 80's Punk 20 min HIIT
const out = path.join(root, "converted", "approved");
mkdirSync(out, { recursive: true });

for (const r of backup.rides) {
  if (SKIP.has(r.id)) { console.log(`skip  ${r.Name} (rebuild by hand)`); continue; }
  const w: V1Workout = { ...r.WorkoutJson, name: r.Name, ...(r.PlaylistUrl ? { playlistUrl: r.PlaylistUrl } : {}) };
  if (r.id === "rec3WVwLv9dsIBHFh") {
    // Segment 5 (index 4): typed "sprint", cue "Breathe. Let your heart rate drop." It is a recovery.
    w.segments = w.segments.map((s, i) => (i === 4 ? { ...s, name: "Recover", type: "recover" as const, cadence: [70, 80] as [number, number], resistance: [25, 35] as [number, number] } : s));
  }
  const oldTotal = r.WorkoutJson.segments.reduce((t, s) => t + s.durationSec, 0);
  const c = convertV1(w, { sprint: "30/30" });
  const ride = parseRideV2({ ...c.ride, id: "", sourceId: r.id }); // strict re-read: what we write must load
  if (rideDuration(ride) !== oldTotal) throw new Error(`${r.Name}: duration changed ${oldTotal} -> ${rideDuration(ride)}`);
  writeFileSync(path.join(out, `${r.id}.json`), JSON.stringify(ride));
  console.log(`ok    ${r.Name}: ${ride.segments.length} segments, ${oldTotal}s, warnings: ${validateRide(ride).map((x) => x.code).join(",") || "none"}`);
}
