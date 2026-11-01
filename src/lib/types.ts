export type SegmentType = "warmup" | "flat" | "climb" | "sprint" | "recover" | "cooldown";
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
