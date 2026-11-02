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
}

export interface Workout {
  id: string;
  name: string;
  genre?: string;
  vibe?: string;
  playlistUrl?: string;
  segments: Segment[];
  tracklist?: Track[];
}
