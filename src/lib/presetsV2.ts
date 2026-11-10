import type { FlatRole, HillSegment, IntervalSegment, Ride, RideSegment, Target } from "./engine";

/** The built-in rides as native v2, with the same ids as the v1 starters in presets.ts. Read-only; never stored in the database. */
const flat = (role: FlatRole, name: string, sec: number, cadence: Target, effort: Target, cue: string): RideSegment => ({ type: "flat", role, name, durationSec: sec, cadence, effort, cue });
const hill = (name: string, sec: number, cadence: Target, from: number, to: number, cue: string): HillSegment => ({ type: "hill", name, durationSec: sec, cadence, effortFrom: from, effortTo: to, cue });
const interval = (name: string, kind: IntervalSegment["workKind"], ratio: "1:1" | "2:1", workSec: number, restSec: number, rounds: number, work: [Target, Target], cue: string): IntervalSegment => ({
  type: "interval", name, workKind: kind, ratio, workSec, restSec, rounds, work: { cadence: work[0], effort: work[1] }, rest: { cadence: [70, 80], effort: [2, 3] }, cue,
});
const warm = (min: number) => flat("warmup", "Warm-up", min * 60, [70, 80], [2, 3], "Easy spin. You could chat all day.");
const cool = (min: number) => flat("cooldown", "Cool-down", min * 60, [65, 75], [1, 2], "Easy spin. Nice work.");
const recover = (sec: number, cadence: Target = [70, 80]) => flat("recover", "Recover", sec, cadence, [2, 3], "Breathe. Let it settle.");

const r = (id: string, name: string, segments: RideSegment[], extra: Partial<Ride> = {}): Ride => ({ schemaVersion: 2, id, name, segments, ...extra });

export const PRESETS_V2: Ride[] = [
  r("preset-beginner-20", "20 min · Beginner", [
    warm(3),
    flat("steady", "Flat road", 240, [80, 90], [3, 4], "Find a steady rhythm."),
    hill("Hill", 180, [65, 75], 4, 6, "Add a notch each minute. Stay smooth."),
    recover(120),
    flat("steady", "Flat road", 240, [85, 95], [4, 5], "Back to your rhythm."),
    hill("Hill", 120, [65, 75], 5, 6, "One more. You've got this."),
    cool(2),
  ]),
  r("preset-hills-sprints-30", "30 min · Hills and sprints", [
    warm(5),
    flat("steady", "Flat road", 300, [85, 95], [4, 5], "Find a steady rhythm."),
    hill("Climb", 300, [60, 70], 4, 6, "Heavy and slow. Stay seated, shoulders loose."),
    interval("Sprint", "sprint", "1:1", 30, 30, 3, [[110, 120], [4, 6]], "Fast legs, stand if you want."),
    recover(120),
    hill("Climb", 300, [60, 70], 5, 7, "Dig in. One more big climb."),
    cool(5),
  ], { genre: "Rock", vibe: "Classic" }),
  r("preset-endurance-45", "45 min · Endurance", [
    warm(5),
    flat("steady", "Flat road", 600, [85, 95], [4, 5], "Settle in. Long and steady."),
    hill("Climb", 600, [65, 75], 4, 6, "Strong and seated. Hold the effort."),
    flat("steady", "Flat road", 600, [85, 95], [4, 5], "Recover your legs at pace."),
    hill("Climb", 300, [60, 70], 5, 7, "Last big effort."),
    cool(5),
  ]),
  r("preset-hiit-20", "20 min · HIIT", [
    warm(3),
    interval("Sprint intervals", "sprint", "2:1", 40, 20, 6, [[110, 120], [4, 6]], "Fast legs. Recover between rounds."),
    recover(120),
    interval("Resistance intervals", "resistance", "1:1", 30, 30, 6, [[55, 65], [8, 9]], "Heavy and strong, then easy."),
    cool(3),
  ]),
  r("preset-hill-repeats-30", "30 min · Hill repeats", [
    warm(5),
    ...Array.from({ length: 4 }, (_, i) => [
      hill("Hill", 240, [55, 65], 5, 7, `Repeat ${i + 1} of 4. Heavy and strong.`),
      recover(90, [75, 85]),
    ]).flat(),
    cool(3),
  ]),
  r("preset-free-ride", "Free ride · timer only", [flat("steady", "Free ride", 1800, [70, 90], [3, 6], "Ride your own ride.")]),
];

export const getPresetV2 = (id: string) => PRESETS_V2.find((p) => p.id === id);
