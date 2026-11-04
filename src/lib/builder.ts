import type { Pacing, Segment, SegmentType, Target, Track, Workout } from "./types";
import { describeSteps, expandSegment } from "./pacing";
import { parseWorkout } from "./validate";

/** Editable form state. Numbers are strings so half-typed input is representable. */
export interface SegDraft {
  key: string;
  name: string;
  type: SegmentType;
  min: string;
  sec: string;
  cadMin: string;
  cadMax: string;
  resMin: string;
  resMax: string;
  cue: string;
  /** auto = sprints run 1:00 on / 1:00 off, climbs add resistance each minute. */
  pacing: Pacing;
  /** Tracks live on their segment so reordering and deleting can never orphan them. */
  tracks: Omit<Track, "segmentIndex">[];
}

export interface WorkoutDraft {
  name: string;
  genre: string;
  vibe: string;
  playlistUrl: string;
  /** Music-planner style picks. Not edited here, but kept so saving a ride doesn't drop them. */
  eras: string[];
  genres: string[];
  seeds: string;
  artistOnly: boolean;
  segments: SegDraft[];
}

let counter = 0;
export const uid = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export const TYPE_OPTIONS: { value: SegmentType; label: string }[] = [
  { value: "warmup", label: "Warm-up" },
  { value: "flat", label: "Flat" },
  { value: "climb", label: "Climb" },
  { value: "sprint", label: "Sprint" },
  { value: "recover", label: "Recover" },
  { value: "cooldown", label: "Cool-down" },
];

const DEFAULTS: Record<SegmentType, { name: string; min: number; cad: [number, number]; res: [number, number]; cue: string }> = {
  warmup: { name: "Warm-up", min: 5, cad: [70, 80], res: [20, 30], cue: "Easy spin. Loosen up." },
  flat: { name: "Flat road", min: 5, cad: [85, 95], res: [40, 50], cue: "Find a steady rhythm." },
  climb: { name: "Climb", min: 5, cad: [60, 70], res: [55, 65], cue: "Heavy and slow. Stay seated." },
  sprint: { name: "Sprint", min: 1, cad: [110, 120], res: [30, 40], cue: "Fast legs." },
  recover: { name: "Recover", min: 2, cad: [70, 80], res: [25, 35], cue: "Breathe. Let your heart rate drop." },
  cooldown: { name: "Cool-down", min: 5, cad: [65, 75], res: [15, 25], cue: "Easy spin. Nice work." },
};

export function newSegment(type: SegmentType, over: Partial<SegDraft> = {}): SegDraft {
  const d = DEFAULTS[type];
  return {
    key: uid(), name: d.name, type, min: String(d.min), sec: "0",
    cadMin: String(d.cad[0]), cadMax: String(d.cad[1]), resMin: String(d.res[0]), resMax: String(d.res[1]),
    cue: d.cue, pacing: "auto", tracks: [], ...over,
  };
}

/** Alternating work/rest pairs, e.g. 5 x (1:00 sprint + 1:30 recover). */
export function intervals(workSec: number, restSec: number, rounds: number): SegDraft[] {
  const out: SegDraft[] = [];
  for (let i = 1; i <= rounds; i++) {
    out.push(newSegment("sprint", { min: String(Math.floor(workSec / 60)), sec: String(workSec % 60), cue: `Interval ${i} of ${rounds}. All out.` }));
    out.push(newSegment("recover", { min: String(Math.floor(restSec / 60)), sec: String(restSec % 60), cue: "Easy. Catch your breath." }));
  }
  return out;
}

export function emptyDraft(): WorkoutDraft {
  return { name: "", genre: "", vibe: "", playlistUrl: "", eras: [], genres: [], seeds: "", artistOnly: false, segments: [newSegment("warmup"), newSegment("flat"), newSegment("cooldown")] };
}

const split = (t: Target | undefined): [string, string] =>
  t === undefined ? ["", ""] : Array.isArray(t) ? (t[0] === t[1] ? [String(t[0]), ""] : [String(t[0]), String(t[1])]) : [String(t), ""];

export function fromWorkout(w: Workout): WorkoutDraft {
  return {
    name: w.name,
    genre: w.genre ?? "",
    vibe: w.vibe ?? "",
    playlistUrl: w.playlistUrl ?? "",
    eras: w.eras ?? [],
    genres: w.genres ?? [],
    seeds: w.seeds ?? "",
    artistOnly: w.artistOnly === true,
    segments: w.segments.map((s, i) => {
      const [cadMin, cadMax] = split(s.cadence);
      const [resMin, resMax] = split(s.resistance);
      return {
        key: uid(), name: s.name, type: s.type,
        min: String(Math.floor(s.durationSec / 60)), sec: String(s.durationSec % 60),
        cadMin, cadMax, resMin, resMax, cue: s.cue, pacing: s.pacing ?? "auto",
        tracks: (w.tracklist ?? []).filter((t) => t.segmentIndex === i).map(({ segmentIndex: _i, ...t }) => t),
      };
    }),
  };
}

function num(s: string, label: string, max: number): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${label} must be a number from 0 to ${max}`);
  return n;
}

function range(lo: string, hi: string, label: string, max: number): Target | undefined {
  const a = num(lo, `${label} min`, max);
  const b = num(hi, `${label} max`, max);
  if (a === undefined && b === undefined) return undefined;
  if (a === undefined) throw new Error(`${label}: fill in the min (or clear both for no target)`);
  if (b === undefined || b === a) return a;
  if (b < a) throw new Error(`${label}: max can't be lower than min`);
  return [a, b];
}

/** Draft to a validated Workout. Throws Error with a message that names the segment. */
export function toWorkout(d: WorkoutDraft, id = ""): Workout {
  const tracklist: Track[] = [];
  const segments = d.segments.map((s, i) => {
    const at = `Segment ${i + 1}`;
    try {
      const m = num(s.min, "Minutes", 360) ?? 0;
      const sec = num(s.sec, "Seconds", 59) ?? 0;
      s.tracks.forEach((t) => tracklist.push({ ...t, segmentIndex: i }));
      return {
        name: s.name, type: s.type, durationSec: m * 60 + sec,
        cadence: range(s.cadMin, s.cadMax, "Cadence", 250),
        resistance: range(s.resMin, s.resMax, "Resistance", 100),
        cue: s.cue,
        pacing: s.pacing,
      };
    } catch (e) {
      throw new Error(`${at}: ${(e as Error).message}`);
    }
  });
  return parseWorkout({
    id, name: d.name, genre: d.genre, vibe: d.vibe, playlistUrl: d.playlistUrl, eras: d.eras, genres: d.genres, seeds: d.seeds, artistOnly: d.artistOnly || undefined,
    segments, tracklist: tracklist.length ? tracklist : undefined,
  });
}

export const draftSeconds = (d: WorkoutDraft) =>
  d.segments.reduce((n, s) => n + (Number(s.min) || 0) * 60 + (Number(s.sec) || 0), 0);

export function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** What a block turns into when ridden, e.g. "ON 1:00 · OFF 1:00 · ON 1:00". Empty if steady or unreadable. */
export function previewSteps(s: SegDraft): string {
  try {
    const seg: Segment = {
      name: s.name, type: s.type, cue: s.cue, pacing: s.pacing,
      durationSec: (num(s.min, "Minutes", 360) ?? 0) * 60 + (num(s.sec, "Seconds", 59) ?? 0),
      cadence: range(s.cadMin, s.cadMax, "Cadence", 250),
      resistance: range(s.resMin, s.resMax, "Resistance", 100),
    };
    return seg.durationSec > 0 ? describeSteps(expandSegment(seg, 0, 0)) : "";
  } catch {
    return "";
  }
}
