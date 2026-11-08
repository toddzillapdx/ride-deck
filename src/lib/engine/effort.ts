import type { Target } from "./types";

export const EFFORT_MIN = 1;
export const EFFORT_MAX = 10;

export const EFFORT_GUIDE: { from: number; to: number; word: string; talk: string }[] = [
  { from: 1, to: 2, word: "Easy", talk: "You could chat all day" },
  { from: 3, to: 4, word: "Comfortable", talk: "Full sentences" },
  { from: 5, to: 6, word: "Steady", talk: "Short sentences" },
  { from: 7, to: 7, word: "Hard", talk: "A few words at a time" },
  { from: 8, to: 8, word: "Very hard", talk: "Single words; holdable for minutes" },
  { from: 9, to: 9, word: "Near max", talk: "30 to 60 seconds, tops" },
  { from: 10, to: 10, word: "All out", talk: "10 to 20 seconds" },
];

export const clampEffort = (n: number) => Math.min(EFFORT_MAX, Math.max(EFFORT_MIN, Math.round(n)));

/** Upper end of a range (or the number), rounded and clamped to 1-10. */
export function effortPeak(e: Target): number {
  return clampEffort(Array.isArray(e) ? e[1] : e);
}

/** The word for an effort. For a range, the upper end rounded. */
export function effortWord(e: Target): string {
  const n = effortPeak(e);
  return EFFORT_GUIDE.find((g) => n >= g.from && n <= g.to)!.word;
}
