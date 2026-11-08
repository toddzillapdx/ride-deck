import { hillLevels, rideDuration } from "./buildPhases";
import { MIN_FINAL_REST_SEC, type Ride, type Warning } from "./types";

/** Soft checks. Warnings never block saving or riding. */
export function validateRide(ride: Ride): Warning[] {
  const w: Warning[] = [];
  ride.segments.forEach((s, i) => {
    if (s.type === "interval") {
      const ok = s.ratio === "1:1" ? s.workSec === s.restSec : s.workSec === 2 * s.restSec;
      if (!ok) w.push({ code: "ratio-mismatch", segmentIndex: i, message: `${s.name}: ${s.workSec}s on / ${s.restSec}s off is not ${s.ratio}.` });
      const fin = s.restSec + (s.finalRestAdjustSec ?? 0);
      if (fin < MIN_FINAL_REST_SEC) w.push({ code: "final-rest-short", segmentIndex: i, message: `${s.name}: the last rest is only ${fin}s (minimum ${MIN_FINAL_REST_SEC}s).` });
    } else if (s.type === "hill" && hillLevels(s) === 1) {
      w.push({ code: "hill-single-level", segmentIndex: i, message: `${s.name}: effort ${s.effortFrom} to ${s.effortTo} has one level, so it rides as a flat stretch.` });
    }
  });
  const tracks = ride.tracklist ?? [];
  if (tracks.length) {
    const missing = tracks.filter((t) => t.durationSec === undefined);
    if (missing.length) w.push({ code: "song-duration-missing", message: `${missing.length} song(s) have no length yet, so the music total is incomplete.` });
    else {
      const music = tracks.reduce((t, x) => t + (x.durationSec ?? 0), 0);
      const total = rideDuration(ride);
      if (music < total) w.push({ code: "songs-vs-segments", message: `Music (${music}s) ends before the segments do (${total}s).` });
    }
  }
  return w;
}
