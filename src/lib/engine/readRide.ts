import { convertV1, type ConvertOptions, type Flag, type V1Workout } from "./convertV1";
import type { Cue, FlatRole, Ride, RideSegment, RideTrack, Stretch, Target } from "./types";

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const ROLES: FlatRole[] = ["warmup", "steady", "recover", "cooldown"];

function target(v: unknown, label: string, min: number, max: number): Target {
  if (isNum(v) && v >= min && v <= max) return v;
  if (Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) && v[0] >= min && v[1] <= max && v[1] >= v[0]) return [v[0], v[1]];
  throw new Error(`${label} must be a number or [min, max] between ${min} and ${max}`);
}
const cadenceT = (v: unknown, l: string) => target(v, `${l} cadence`, 1, 250);
const effortT = (v: unknown, l: string) => target(v, `${l} effort`, 1, 10);
const effortN = (v: unknown, l: string) => {
  if (!isNum(v) || !Number.isInteger(v) || v < 1 || v > 10) throw new Error(`${l} must be a whole number 1-10`);
  return v;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function cue(v: unknown, l: string): Cue {
  const o = (v ?? {}) as Record<string, unknown>;
  return { cadence: cadenceT(o.cadence, l), effort: effortT(o.effort, l) };
}

function segment(raw: unknown, i: number): RideSegment {
  const s = (raw ?? {}) as Record<string, unknown>;
  const at = `Segment ${i + 1}`;
  const name = str(s.name);
  if (!name) throw new Error(`${at} needs a name`);
  const cueText = typeof s.cue === "string" ? s.cue : "";
  const dur = () => {
    if (!isNum(s.durationSec) || s.durationSec < 1 || s.durationSec > 6 * 3600) throw new Error(`${at} durationSec must be 1 to 21600`);
    return Math.round(s.durationSec);
  };
  if (s.type === "flat") {
    if (!ROLES.includes(s.role as FlatRole)) throw new Error(`${at} role must be one of ${ROLES.join(", ")}`);
    return { type: "flat", role: s.role as FlatRole, name, durationSec: dur(), cadence: cadenceT(s.cadence, at), effort: effortT(s.effort, at), cue: cueText };
  }
  if (s.type === "hill") {
    const stepSec = s.stepSec === undefined ? undefined : s.stepSec;
    if (stepSec !== undefined && (!isNum(stepSec) || stepSec < 1)) throw new Error(`${at} stepSec must be a positive number`);
    return {
      type: "hill", name, durationSec: dur(), cadence: cadenceT(s.cadence, at),
      effortFrom: effortN(s.effortFrom, `${at} effortFrom`), effortTo: effortN(s.effortTo, `${at} effortTo`),
      ...(stepSec !== undefined ? { stepSec: stepSec as number } : {}), cue: cueText,
    };
  }
  if (s.type === "interval") {
    if (s.workKind !== "sprint" && s.workKind !== "resistance") throw new Error(`${at} workKind must be sprint or resistance`);
    if (s.ratio !== "1:1" && s.ratio !== "2:1") throw new Error(`${at} ratio must be 1:1 or 2:1`);
    for (const k of ["workSec", "restSec", "rounds"] as const) if (!isNum(s[k]) || !Number.isInteger(s[k]) || (s[k] as number) < 1) throw new Error(`${at} ${k} must be a whole number of 1 or more`);
    if (s.finalRestAdjustSec !== undefined && !isNum(s.finalRestAdjustSec)) throw new Error(`${at} finalRestAdjustSec must be a number`);
    return {
      type: "interval", name, workKind: s.workKind, ratio: s.ratio, workSec: s.workSec as number, restSec: s.restSec as number, rounds: s.rounds as number,
      ...(isNum(s.finalRestAdjustSec) && s.finalRestAdjustSec !== 0 ? { finalRestAdjustSec: s.finalRestAdjustSec } : {}),
      work: cue(s.work, `${at} work`), rest: cue(s.rest, `${at} rest`), cue: cueText,
    };
  }
  throw new Error(`${at} type must be flat, interval or hill`);
}

/** Validates and normalizes untrusted v2 JSON. Throws Error(message) on bad input. */
export function parseRideV2(input: unknown): Ride {
  const o = (input ?? {}) as Record<string, unknown>;
  if (typeof input !== "object" || input === null) throw new Error("Ride must be a JSON object");
  if (!str(o.name)) throw new Error("Ride needs a name");
  if (!Array.isArray(o.segments) || o.segments.length === 0) throw new Error("Ride needs at least one segment");
  if (o.segments.length > 100) throw new Error("Too many segments (max 100)");
  const segments = o.segments.map(segment);

  let tracklist: RideTrack[] | undefined;
  if (o.tracklist !== undefined) {
    if (!Array.isArray(o.tracklist)) throw new Error("tracklist must be an array");
    tracklist = o.tracklist.map((raw, i) => {
      const t = (raw ?? {}) as Record<string, unknown>;
      if (!isNum(t.segmentIndex) || t.segmentIndex < 0 || t.segmentIndex >= segments.length) throw new Error(`Track ${i + 1} has a bad segmentIndex`);
      if (typeof t.title !== "string" || typeof t.artist !== "string") throw new Error(`Track ${i + 1} needs title and artist`);
      return {
        segmentIndex: t.segmentIndex, title: t.title, artist: t.artist,
        ...(isNum(t.durationSec) && t.durationSec > 0 ? { durationSec: Math.round(t.durationSec) } : {}),
        ...(str(t.durationSource) ? { durationSource: str(t.durationSource)!.slice(0, 40) } : {}),
        ...(isNum(t.approxDurationSec) ? { approxDurationSec: t.approxDurationSec } : {}),
        ...(isNum(t.approxBpm) ? { approxBpm: t.approxBpm } : {}),
        ...(str(t.reason) ? { reason: str(t.reason) } : {}),
        ...(str(t.genre) ? { genre: str(t.genre)!.slice(0, 40) } : {}),
        ...(str(t.era) ? { era: str(t.era)!.slice(0, 40) } : {}),
        ...(str(t.album) ? { album: str(t.album)!.slice(0, 160) } : {}),
      };
    });
  }

  let stretches: Stretch[] | undefined;
  if (Array.isArray(o.stretches) && o.stretches.length) {
    stretches = o.stretches.map((raw, i) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      if (!str(s.name)) throw new Error(`Stretch ${i + 1} needs a name`);
      return { name: str(s.name)!, holdSec: isNum(s.holdSec) && s.holdSec > 0 ? Math.round(s.holdSec) : 30 };
    });
  }

  const list = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 12).map((x) => x.trim().slice(0, max)) : undefined;
  const playlistUrl = str(o.playlistUrl);
  if (playlistUrl && !/^https?:\/\//i.test(playlistUrl)) throw new Error("playlistUrl must start with http:// or https://");

  return {
    schemaVersion: 2, id: typeof o.id === "string" ? o.id : "", sourceId: str(o.sourceId), name: str(o.name)!,
    genre: str(o.genre), vibe: str(o.vibe), eras: list(o.eras, 20), genres: list(o.genres, 30),
    seeds: typeof o.seeds === "string" && o.seeds.trim() ? o.seeds.trim().slice(0, 300) : undefined,
    artistOnly: o.artistOnly === true ? true : undefined, playlistUrl, segments, tracklist, stretches,
  };
}

export interface ReadResult {
  ride: Ride;
  /** True when the stored ride was v1 and was converted on the fly. */
  converted: boolean;
  flags: Flag[];
}

/** Reads any stored ride. v2 is validated; v1 (no schemaVersion) is converted on read, never rewritten. */
export function readRide(input: unknown, opts?: ConvertOptions): ReadResult {
  const o = (input ?? {}) as Record<string, unknown>;
  if (o.schemaVersion === 2) return { ride: parseRideV2(input), converted: false, flags: [] };
  if (o.schemaVersion !== undefined) throw new Error(`Unknown ride schemaVersion ${String(o.schemaVersion)}`);
  if (typeof input !== "object" || input === null || !Array.isArray(o.segments)) throw new Error("Ride must be a JSON object with segments");
  const c = convertV1(input as V1Workout, opts);
  return { ride: c.ride, converted: true, flags: c.flags };
}
