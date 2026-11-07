import { segmentDuration } from "./buildPhases";
import type { Ride, RideTrack } from "./types";

/** Used only when a song has neither a real nor an estimated length (the V1 behavior). */
export const DEFAULT_SONG_SEC = 210;

export const trackSec = (t: RideTrack) => t.durationSec ?? t.approxDurationSec ?? DEFAULT_SONG_SEC;

/** Start second of each segment. */
export function segmentStarts(ride: Pick<Ride, "segments">): number[] {
  let t = 0;
  return ride.segments.map((s) => ((t += segmentDuration(s)), t - segmentDuration(s)));
}

/** When each track starts, assuming songs in a segment play back to back from the segment's start. A guide only. */
export function trackTimeline(ride: Ride): { track: RideTrack; startSec: number }[] {
  const starts = segmentStarts(ride);
  const out: { track: RideTrack; startSec: number }[] = [];
  ride.segments.forEach((_, i) => {
    let offset = 0;
    for (const t of (ride.tracklist ?? []).filter((x) => x.segmentIndex === i)) {
      out.push({ track: t, startSec: starts[i] + offset });
      offset += trackSec(t);
    }
  });
  return out;
}

export function trackAt(ride: Ride, elapsedSec: number): { now?: RideTrack; next?: RideTrack } {
  const tl = trackTimeline(ride);
  let idx = -1;
  tl.forEach((e, i) => { if (e.startSec <= elapsedSec) idx = i; });
  return { now: tl[idx]?.track, next: tl[idx + 1]?.track };
}
