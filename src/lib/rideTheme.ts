/**
 * Ride-screen thresholds and colors in one place, so they can be tuned after riding.
 * (Todd: change a number here and rebuild.)
 */
/** Seconds before the end of a SEGMENT when the screen flips to announce what is next. Never used between hill steps or inside an interval. */
export const WARN_SEC = 10;
/** Seconds before the end of each interval WORK/REST phase when the giant 3-2-1 appears. */
export const COUNTDOWN_SEC = 3;

export const GROUND = "#002A33";
export const ICE = "#C4DFE6";
export const INK = "#F4F5F7";
export const MIST = "#66A5AD";

/** Interval WORK is the ice screen with ground-colored text; REST is the normal ground screen. */
export const WORK_BG = ICE;
export const WORK_FG = GROUND;
export const REST_BG = GROUND;
export const REST_FG = INK;
/** The segment-change flip. */
export const FLIP_BG = ICE;
export const FLIP_FG = GROUND;
