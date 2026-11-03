import type { Pacing, Segment, SegmentType, Target, Track, Workout } from "./types";

const TYPES: SegmentType[] = ["warmup", "flat", "climb", "sprint", "recover", "cooldown"];
const PACINGS: Pacing[] = ["auto", "steady", "intervals", "ramp"];

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function target(v: unknown, label: string): Target | undefined {
  if (v === undefined || v === null) return undefined;
  if (isNum(v) && v >= 0) return v;
  if (Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) && v[0] >= 0 && v[1] >= v[0]) return [v[0], v[1]];
  throw new Error(`${label} must be a number or a [min, max] range`);
}

/** Validates and normalizes untrusted workout JSON. Throws Error(message) on bad input. */
export function parseWorkout(input: unknown): Workout {
  if (!input || typeof input !== "object") throw new Error("Workout must be a JSON object");
  const o = input as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim()) throw new Error("Workout needs a name");
  if (!Array.isArray(o.segments) || o.segments.length === 0) throw new Error("Workout needs at least one segment");
  if (o.segments.length > 100) throw new Error("Too many segments (max 100)");

  const segments: Segment[] = o.segments.map((raw, i) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const at = `Segment ${i + 1}`;
    if (typeof s.name !== "string" || !s.name.trim()) throw new Error(`${at} needs a name`);
    if (!TYPES.includes(s.type as SegmentType)) throw new Error(`${at} type must be one of ${TYPES.join(", ")}`);
    if (!isNum(s.durationSec) || s.durationSec < 1 || s.durationSec > 6 * 3600) throw new Error(`${at} durationSec must be 1 to 21600`);
    if (s.pacing !== undefined && s.pacing !== null && !PACINGS.includes(s.pacing as Pacing)) throw new Error(`${at} pacing must be one of ${PACINGS.join(", ")}`);
    return {
      name: s.name.trim(),
      type: s.type as SegmentType,
      durationSec: Math.round(s.durationSec),
      cadence: target(s.cadence, `${at} cadence`),
      resistance: target(s.resistance, `${at} resistance`),
      cue: typeof s.cue === "string" ? s.cue : "",
      // "auto" is the default, so it is stored as absent.
      ...(s.pacing && s.pacing !== "auto" ? { pacing: s.pacing as Pacing } : {}),
    };
  });

  let tracklist: Track[] | undefined;
  if (o.tracklist !== undefined) {
    if (!Array.isArray(o.tracklist)) throw new Error("tracklist must be an array");
    tracklist = o.tracklist.map((raw, i) => {
      const t = (raw ?? {}) as Record<string, unknown>;
      if (!isNum(t.segmentIndex) || t.segmentIndex < 0 || t.segmentIndex >= segments.length) throw new Error(`Track ${i + 1} has a bad segmentIndex`);
      if (typeof t.title !== "string" || typeof t.artist !== "string") throw new Error(`Track ${i + 1} needs title and artist`);
      return {
        segmentIndex: t.segmentIndex, title: t.title, artist: t.artist,
        ...(isNum(t.approxBpm) ? { approxBpm: t.approxBpm } : {}),
        ...(isNum(t.approxDurationSec) ? { approxDurationSec: t.approxDurationSec } : {}),
        ...(typeof t.reason === "string" && t.reason ? { reason: t.reason } : {}),
        ...(typeof t.genre === "string" && t.genre ? { genre: t.genre.slice(0, 40) } : {}),
        ...(typeof t.era === "string" && t.era ? { era: t.era.slice(0, 40) } : {}),
      };
    });
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const list = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 12).map((x) => x.trim().slice(0, max)) : undefined;
  const playlistUrl = str(o.playlistUrl);
  if (playlistUrl && !/^https?:\/\//i.test(playlistUrl)) throw new Error("playlistUrl must start with http:// or https://");

  return {
    id: typeof o.id === "string" ? o.id : "",
    name: o.name.trim(),
    genre: str(o.genre),
    vibe: str(o.vibe),
    eras: list(o.eras, 20),
    genres: list(o.genres, 30),
    seeds: typeof o.seeds === "string" && o.seeds.trim() ? o.seeds.trim().slice(0, 300) : undefined,
    playlistUrl,
    segments,
    tracklist,
  };
}
