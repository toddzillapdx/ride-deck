import { describe, expect, it } from "vitest";
import { limitSongs, missingSegments, segmentNeeds, buildUserMessage, SYSTEM_PROMPT } from "../planner";
import type { Track, Workout } from "../types";

const w: Workout = {
  id: "x", name: "r",
  segments: [
    { name: "Warm", type: "warmup", durationSec: 120, cue: "" },
    { name: "Hill", type: "climb", durationSec: 240, cue: "" },
    { name: "Sprint", type: "sprint", durationSec: 180, cue: "" },
    { name: "Flat", type: "flat", durationSec: 600, cue: "" },
  ],
};
const input = (over = {}) => ({ workout: w, eras: [], genres: [], vibe: "Classic", seeds: "", artistOnly: false, keep: [] as Track[], avoid: [] as string[], regenerate: [0, 1, 2, 3], ...over });
const tr = (segmentIndex: number, title: string): Track => ({ segmentIndex, title, artist: title });

describe("planner song counts", () => {
  it("a short segment (2 min) still needs a song, and hills/intervals need exactly one", () => {
    const needs = segmentNeeds(input());
    expect(needs.map((n) => [n.segmentIndex, n.minSongs, n.maxSongs])).toEqual([[0, 1, undefined], [1, 1, 1], [2, 1, 1], [3, 1, undefined]]);
  });
  it("the prompt no longer lets a segment go without a song", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/do not need their own song/i);
    expect(SYSTEM_PROMPT).toMatch(/EVERY segment/);
  });
  it("hills and intervals are trimmed to one song", () => {
    const needs = segmentNeeds(input());
    const out = limitSongs([tr(1, "a"), tr(1, "b"), tr(2, "c"), tr(3, "d"), tr(3, "e")], needs);
    expect(out.map((t) => t.title)).toEqual(["a", "c", "d", "e"]);
  });
  it("a swap returns exactly one song, even when the model sends several", () => {
    const needs = segmentNeeds(input({ regenerate: [3], exactly: 1, keep: [tr(3, "kept")] }));
    expect(limitSongs([tr(3, "x"), tr(3, "y"), tr(3, "z")], needs, 1)).toHaveLength(1);
    expect(buildUserMessage(input({ regenerate: [3], exactly: 1 }) as never, needs)).toMatch(/exactly 1 song in total/);
  });
  it("a swap is never skipped as 'already full'", () => {
    const needs = segmentNeeds(input({ regenerate: [3], exactly: 1, keep: [tr(3, "a"), tr(3, "b"), tr(3, "c"), tr(3, "d")].map((t) => ({ ...t, approxDurationSec: 200 })) }));
    expect(needs).toHaveLength(1);
  });
  it("finds segments that still have no song at all", () => {
    const needs = segmentNeeds(input());
    expect(missingSegments([tr(0, "a"), tr(3, "b")], needs, [tr(2, "kept")])).toEqual([1]);
  });
});
