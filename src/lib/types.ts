export type SegmentType = "warmup" | "flat" | "climb" | "sprint" | "recover" | "cooldown";
/** How a block was ridden in v1 (kept so old rides still parse). v2 rides use intervals and hills instead. */
export type Pacing = "auto" | "steady" | "intervals" | "ramp";
/** A target is a [min, max] range or a single number. */
export type Target = [number, number] | number;

export interface Segment {
  name: string;
  type: SegmentType;
  durationSec: number;
  /** Optional so a free ride can be timer-only. */
  cadence?: Target;
  resistance?: Target;
  cue: string;
  pacing?: Pacing;
}

export interface Track {
  segmentIndex: number;
  title: string;
  artist: string;
  approxBpm?: number;
  /** Approximate song length in seconds, used to pace songs against segments. */
  approxDurationSec?: number;
  /** A real song length (from the rider or a catalog), never an estimate. */
  durationSec?: number;
  durationSource?: string;
  /** One line on why the song fits the segment. */
  reason?: string;
  /** The style label the planner filed this song under (one of the chosen genres/eras, or "Other"). */
  genre?: string;
  era?: string;
  album?: string;
}

export interface Workout {
  id: string;
  name: string;
  /** Display summary of the style, e.g. "90s, Hip-hop / Rap". The structured picks are eras/genres. */
  genre?: string;
  vibe?: string;
  /** Style picks for the music planner. Empty means any. */
  eras?: string[];
  genres?: string[];
  /** "Sounds like": songs, artists or a short note. */
  seeds?: string;
  /** Play only the artist(s) named in `seeds` (or the artist of a named song), not similar ones. */
  artistOnly?: boolean;
  playlistUrl?: string;
  segments: Segment[];
  tracklist?: Track[];
}
