export type SegmentType = "warmup" | "flat" | "climb" | "sprint" | "recover" | "cooldown";
/**
 * How a block is ridden. `auto` (the default) means sprints run 1:00 on / 1:00 off and climbs add
 * resistance every minute; everything else is steady. See lib/pacing.ts.
 */
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
  /** One line on why the song fits the segment. */
  reason?: string;
  /** The style label the planner filed this song under (one of the chosen genres/eras, or "Other"). */
  genre?: string;
  era?: string;
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
