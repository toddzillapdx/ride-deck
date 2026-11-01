import type { Segment, Workout } from "./types";

const seg = (
  name: string, type: Segment["type"], min: number, sec: number,
  cadence: [number, number], resistance: [number, number], cue: string,
): Segment => ({ name, type, durationSec: min * 60 + sec, cadence, resistance, cue });

const warm = (min: number) => seg("Warm-up", "warmup", min, 0, [70, 80], [20, 30], "Easy spin. Loosen up.");
const cool = (min: number) => seg("Cool-down", "cooldown", min, 0, [65, 75], [15, 25], "Easy spin. Nice work.");

/** Built-in rides. Read-only; they ship with the app and are never stored in Airtable. */
export const PRESETS: Workout[] = [
  {
    id: "preset-beginner-20",
    name: "20 min · Beginner",
    segments: [
      warm(3),
      seg("Flat road", "flat", 4, 0, [80, 90], [35, 45], "Find a steady rhythm."),
      seg("Climb", "climb", 3, 0, [65, 75], [50, 60], "Add resistance. Stay smooth."),
      seg("Recover", "recover", 2, 0, [70, 80], [25, 35], "Breathe. Let your heart rate drop."),
      seg("Flat road", "flat", 4, 0, [85, 95], [40, 50], "Back to your rhythm."),
      seg("Climb", "climb", 2, 0, [65, 75], [55, 65], "One more. You've got this."),
      cool(2),
    ],
  },
  {
    id: "preset-hills-sprints-30",
    name: "30 min · Hills and sprints",
    genre: "Rock",
    vibe: "Classic",
    segments: [
      warm(5),
      seg("Flat road", "flat", 5, 0, [85, 95], [40, 50], "Find a steady rhythm."),
      seg("Climb", "climb", 5, 0, [60, 70], [55, 65], "Heavy and slow. Stay seated, shoulders loose."),
      seg("Sprint", "sprint", 3, 0, [110, 120], [30, 40], "Fast legs, stand if you want."),
      seg("Recover", "recover", 2, 0, [70, 80], [25, 35], "Breathe. Let your heart rate drop."),
      seg("Climb", "climb", 5, 0, [60, 70], [60, 70], "Dig in. One more big climb."),
      cool(5),
    ],
  },
  {
    id: "preset-endurance-45",
    name: "45 min · Endurance",
    segments: [
      warm(5),
      seg("Flat road", "flat", 10, 0, [85, 95], [40, 50], "Settle in. Long and steady."),
      seg("Climb", "climb", 10, 0, [65, 75], [55, 65], "Strong and seated. Hold the effort."),
      seg("Flat road", "flat", 10, 0, [85, 95], [40, 50], "Recover your legs at pace."),
      seg("Climb", "climb", 5, 0, [60, 70], [60, 70], "Last big effort."),
      cool(5),
    ],
  },
  {
    id: "preset-hiit-20",
    name: "20 min · HIIT",
    segments: [
      seg("Warm-up", "warmup", 4, 0, [70, 80], [20, 30], "Build gradually."),
      ...Array.from({ length: 5 }, (_, i) => [
        seg("Sprint", "sprint", 1, 0, [105, 120], [35, 45], `Interval ${i + 1} of 5. All out.`),
        seg("Recover", "recover", 1, 30, [65, 75], [20, 30], "Easy. Catch your breath."),
      ]).flat(),
      seg("Cool-down", "cooldown", 3, 30, [65, 75], [15, 25], "Easy spin. Nice work."),
    ],
  },
  {
    id: "preset-hill-repeats-30",
    name: "30 min · Hill repeats",
    segments: [
      warm(5),
      ...Array.from({ length: 4 }, (_, i) => [
        seg("Climb", "climb", 4, 0, [55, 65], [60, 75], `Repeat ${i + 1} of 4. Heavy and strong.`),
        seg("Recover", "recover", 1, 30, [75, 85], [25, 35], "Spin it out."),
      ]).flat(),
      cool(3),
    ],
  },
  {
    id: "preset-free-ride",
    name: "Free ride · timer only",
    segments: [{ name: "Free ride", type: "flat", durationSec: 1800, cue: "Ride your own ride." }],
  },
];

export const isPresetId = (id: string) => id.startsWith("preset-");
export const getPreset = (id: string) => PRESETS.find((p) => p.id === id);
export const totalSeconds = (w: Workout) => w.segments.reduce((n, s) => n + s.durationSec, 0);
