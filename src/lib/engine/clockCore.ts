/**
 * Pure ride clock. Time is injected, so tests can drive it and pause/resume is exact.
 * State is plain data, so it can be saved to localStorage and restored after a reload.
 */
export interface ClockState {
  /** Ride milliseconds banked while running, before the current run started. */
  bankedMs: number;
  /** Wall-clock ms when the current run started, or null while paused/stopped. */
  runningSince: number | null;
  /** Ride seconds per wall-clock second. 1 in production. */
  speed: number;
}

export const SPEEDS = [1, 10, 30] as const;

/** The speed-up clock is for testing only. In production the requested speed is ignored. */
export function resolveSpeed(requested: number | undefined, isProduction: boolean): number {
  if (isProduction) return 1;
  return (SPEEDS as readonly number[]).includes(requested ?? 1) ? (requested as number) : 1;
}

export const newClock = (speed = 1): ClockState => ({ bankedMs: 0, runningSince: null, speed });
export const startClock = (c: ClockState, now: number): ClockState => (c.runningSince === null ? { ...c, runningSince: now } : c);
export const pauseClock = (c: ClockState, now: number): ClockState =>
  c.runningSince === null ? c : { ...c, bankedMs: elapsedMs(c, now), runningSince: null };
export const resumeClock = startClock;

export function elapsedMs(c: ClockState, now: number): number {
  return c.bankedMs + (c.runningSince === null ? 0 : Math.max(0, now - c.runningSince) * c.speed);
}
export const elapsedSec = (c: ClockState, now: number) => Math.floor(elapsedMs(c, now) / 1000);
export const isRunning = (c: ClockState) => c.runningSince !== null;
