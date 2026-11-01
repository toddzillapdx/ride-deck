import type { Target } from "./types";

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtTarget(t: Target | undefined): string {
  if (t === undefined) return "—";
  return Array.isArray(t) ? (t[0] === t[1] ? `${t[0]}` : `${t[0]}–${t[1]}`) : `${t}`;
}

export function midpoint(t: Target): number {
  return Array.isArray(t) ? (t[0] + t[1]) / 2 : t;
}

export type Direction = "up" | "down" | "same";

export function direction(prev: Target | undefined, next: Target | undefined): Direction {
  if (prev === undefined || next === undefined) return "same";
  const d = midpoint(next) - midpoint(prev);
  return d > 0 ? "up" : d < 0 ? "down" : "same";
}

/** "Was 85–95 · down 25" compares midpoints. */
export function wasLine(prev: Target | undefined, next: Target | undefined, first = false): string {
  if (next === undefined) return "Your own pace";
  if (first || prev === undefined) return "First segment";
  const d = Math.round(midpoint(next) - midpoint(prev));
  const dir = d === 0 ? "no change" : `${d > 0 ? "up" : "down"} ${Math.abs(d)}`;
  return `Was ${fmtTarget(prev)} · ${dir}`;
}
