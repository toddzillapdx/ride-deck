/** Ride schema v2. Pure types, no React, so the same model can be ported to Swift later. */

/** A target is a [min, max] range or a single number. */
export type Target = [number, number] | number;

export type FlatRole = "warmup" | "steady" | "recover" | "cooldown";
export type IntervalKind = "sprint" | "resistance";
export type IntervalRatio = "1:1" | "2:1";

export interface Cue {
  cadence: Target;
  /** 1-10 by feel. See effort.ts for the words. */
  effort: Target;
}

export interface FlatSegment {
  type: "flat";
  role: FlatRole;
  name: string;
  durationSec: number;
  cadence: Target;
  effort: Target;
  cue: string;
}

export interface IntervalSegment {
  type: "interval";
  name: string;
  workKind: IntervalKind;
  ratio: IntervalRatio;
  workSec: number;
  restSec: number;
  rounds: number;
  /** Added to the LAST rest so the block can land on a song boundary. May be negative. */
  finalRestAdjustSec?: number;
  work: Cue;
  rest: Cue;
  cue: string;
}

export interface HillSegment {
  type: "hill";
  name: string;
  durationSec: number;
  /** Cadence holds steady across the hill. */
  cadence: Target;
  effortFrom: number;
  effortTo: number;
  /** Optional override of seconds per effort level. Default: durationSec / levels. */
  stepSec?: number;
  cue: string;
}

export type RideSegment = FlatSegment | IntervalSegment | HillSegment;

export interface RideTrack {
  segmentIndex: number;
  title: string;
  artist: string;
  /** Real song length. Only ever from a catalog or from the rider, never guessed. */
  durationSec?: number;
  /** Free text: "apple", "spotify", "manual". Informational. */
  durationSource?: string;
  /** v1 leftovers: an LLM estimate. Never used for fitting. */
  approxDurationSec?: number;
  approxBpm?: number;
  reason?: string;
  genre?: string;
  era?: string;
  /** Catalog album, shown in the playlist prompt so the right version is picked. */
  album?: string;
}

export interface Stretch {
  name: string;
  holdSec: number;
}

export interface Ride {
  schemaVersion: 2;
  id: string;
  /** The v1 ride this is a converted copy of. The library hides that original (it stays in the legacy table, read-only). */
  sourceId?: string;
  name: string;
  genre?: string;
  vibe?: string;
  eras?: string[];
  genres?: string[];
  seeds?: string;
  artistOnly?: boolean;
  playlistUrl?: string;
  segments: RideSegment[];
  tracklist?: RideTrack[];
  stretches?: Stretch[];
}

export type PhaseKind = "flat" | "work" | "rest" | "hillStep";

export interface Phase {
  segmentIndex: number;
  kind: PhaseKind;
  /** Absolute seconds from the start of the ride. Half-open: [startSec, endSec). */
  startSec: number;
  endSec: number;
  cadence: Target;
  effort: Target;
  label: string;
  round?: number;
  roundsTotal?: number;
  step?: number;
  stepsTotal?: number;
}

export interface Warning {
  code:
    | "ratio-mismatch"
    | "final-rest-short"
    | "hill-single-level"
    | "songs-vs-segments"
    | "song-duration-missing";
  segmentIndex?: number;
  message: string;
}

export const MIN_FINAL_REST_SEC = 5;
