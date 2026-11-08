import type { Stretch } from "./types";

/** Used when a ride has no `stretches` of its own. holdSec is the optional per-stretch timer. */
export const DEFAULT_STRETCHES: Stretch[] = [
  { name: "Quads", holdSec: 30 },
  { name: "Hamstrings", holdSec: 30 },
  { name: "Calves", holdSec: 30 },
  { name: "Hip flexors", holdSec: 30 },
  { name: "Glutes (figure-4)", holdSec: 30 },
  { name: "Chest and shoulders", holdSec: 30 },
];

export const stretchesFor = (ride: { stretches?: Stretch[] }): Stretch[] =>
  ride.stretches && ride.stretches.length ? ride.stretches : DEFAULT_STRETCHES;
