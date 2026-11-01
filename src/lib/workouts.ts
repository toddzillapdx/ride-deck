import type { Workout } from "./types";

/** Hard-coded sample ride for the skeleton. Library and presets arrive in build step 3. */
export const SAMPLE_WORKOUT: Workout = {
  id: "hills-sprints-30",
  name: "30 min · Hills and sprints",
  genre: "Rock",
  vibe: "Classic",
  playlistUrl: "",
  segments: [
    { name: "Warm-up", type: "warmup", durationSec: 300, cadence: [70, 80], resistance: [20, 30], cue: "Easy spin. Loosen up." },
    { name: "Flat road", type: "flat", durationSec: 300, cadence: [85, 95], resistance: [40, 50], cue: "Find a steady rhythm." },
    { name: "Climb", type: "climb", durationSec: 300, cadence: [60, 70], resistance: [55, 65], cue: "Heavy and slow. Stay seated, shoulders loose." },
    { name: "Sprint", type: "sprint", durationSec: 180, cadence: [110, 120], resistance: [30, 40], cue: "Fast legs, stand if you want." },
    { name: "Recover", type: "recover", durationSec: 120, cadence: [70, 80], resistance: [25, 35], cue: "Breathe. Let your heart rate drop." },
    { name: "Climb", type: "climb", durationSec: 300, cadence: [60, 70], resistance: [60, 70], cue: "Dig in. One more big climb." },
    { name: "Cool-down", type: "cooldown", durationSec: 300, cadence: [65, 75], resistance: [15, 25], cue: "Easy spin. Nice work." },
  ],
  tracklist: [
    { segmentIndex: 0, title: "Dreams", artist: "Fleetwood Mac", approxBpm: 120 },
    { segmentIndex: 1, title: "Take Me Out", artist: "Franz Ferdinand", approxBpm: 105 },
    { segmentIndex: 2, title: "Black Dog", artist: "Led Zeppelin", approxBpm: 85 },
    { segmentIndex: 3, title: "Dog Days Are Over", artist: "Florence + The Machine", approxBpm: 150 },
    { segmentIndex: 4, title: "Wish You Were Here", artist: "Pink Floyd", approxBpm: 60 },
    { segmentIndex: 5, title: "Whole Lotta Love", artist: "Led Zeppelin", approxBpm: 90 },
    { segmentIndex: 6, title: "Landslide", artist: "Fleetwood Mac", approxBpm: 70 },
  ],
};
