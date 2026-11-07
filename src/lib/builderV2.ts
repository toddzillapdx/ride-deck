import {
  DEFAULT_STRETCHES, fitSegmentsToSongs, parseRideV2, rideDuration, segmentDuration, stretchesFor, validateRide,
  type FitTemplate, type FlatRole, type IntervalKind, type IntervalRatio, type Ride, type RideSegment, type RideTrack, type Song, type Stretch, type Target, type Warning,
} from "./engine";

/** Editable form state for the v2 builder. Numbers are strings so half-typed input is representable. */
export type SegType = "flat" | "interval" | "hill";

export interface SongDraft extends Omit<RideTrack, "segmentIndex"> { key: string }

export interface SegDraft {
  key: string;
  type: SegType;
  name: string;
  cue: string;
  // flat + hill
  min: string; sec: string; cadMin: string; cadMax: string;
  // flat
  role: FlatRole; effMin: string; effMax: string;
  // hill
  effFrom: string; effTo: string; stepSec: string;
  // interval
  workKind: IntervalKind; ratio: IntervalRatio; workSec: string; restSec: string; rounds: string; adjust: string;
  wCadMin: string; wCadMax: string; wEffMin: string; wEffMax: string;
  rCadMin: string; rCadMax: string; rEffMin: string; rEffMax: string;
  /** How many songs this segment covers (hills and intervals take exactly one). */
  songCount: string;
}

export interface RideDraft {
  name: string; genre: string; vibe: string; playlistUrl: string;
  eras: string[]; genres: string[]; seeds: string; artistOnly: boolean;
  segments: SegDraft[];
  /** The master song list, in order. Segments take songs from it front to back by their songCount. */
  songs: SongDraft[];
  stretches?: Stretch[];
  /** Set when this is a converted copy of a read-only v1 ride. */
  sourceId?: string;
}

let counter = 0;
export const uid = () => `b${Date.now().toString(36)}${(counter++).toString(36)}`;

const s = (n: number | string) => String(n);

export function newSeg(type: SegType, over: Partial<SegDraft> = {}): SegDraft {
  const base: SegDraft = {
    key: uid(), type, name: "", cue: "", min: "4", sec: "0", cadMin: "85", cadMax: "95",
    role: "steady", effMin: "4", effMax: "5", effFrom: "5", effTo: "8", stepSec: "",
    workKind: "sprint", ratio: "1:1", workSec: "30", restSec: "30", rounds: "4", adjust: "0",
    wCadMin: "110", wCadMax: "120", wEffMin: "8", wEffMax: "9", rCadMin: "70", rCadMax: "80", rEffMin: "2", rEffMax: "3",
    songCount: "1",
  };
  if (type === "flat") Object.assign(base, { name: "Flat road", cue: "Find a steady rhythm." });
  if (type === "hill") Object.assign(base, { name: "Hill", min: "4", cadMin: "60", cadMax: "70", cue: "Heavy and slow. Add a notch each step." });
  if (type === "interval") Object.assign(base, { name: "Sprint intervals", cue: "Fast legs. Recover between rounds." });
  return { ...base, ...over };
}

export const newFlat = (role: FlatRole, over: Partial<SegDraft> = {}) => {
  const d: Record<FlatRole, Partial<SegDraft>> = {
    warmup: { name: "Warm-up", min: "4", cadMin: "70", cadMax: "80", effMin: "2", effMax: "3", cue: "Easy spin. You could chat all day." },
    steady: { name: "Flat road", min: "4", cadMin: "85", cadMax: "95", effMin: "4", effMax: "5", cue: "Find a steady rhythm." },
    recover: { name: "Recover", min: "4", cadMin: "70", cadMax: "80", effMin: "2", effMax: "3", cue: "Breathe. Let it settle." },
    cooldown: { name: "Cool-down", min: "4", cadMin: "65", cadMax: "75", effMin: "1", effMax: "2", cue: "Easy spin. Nice work." },
  };
  return newSeg("flat", { role, ...d[role], ...over });
};

/** Work/rest defaults for a ratio and kind. Seconds are editable; the validator warns if they stop matching. */
export const RATIO_SECONDS: Record<IntervalRatio, [number, number]> = { "1:1": [30, 30], "2:1": [40, 20] };
export function intervalDefaults(kind: IntervalKind): Partial<SegDraft> {
  return kind === "sprint"
    ? { workKind: "sprint", name: "Sprint intervals", wCadMin: "110", wCadMax: "120", wEffMin: "8", wEffMax: "9", cue: "Fast legs. Recover between rounds." }
    : { workKind: "resistance", name: "Resistance intervals", wCadMin: "55", wCadMax: "65", wEffMin: "8", wEffMax: "9", cue: "Heavy and strong, then easy." };
}

export interface Template { label: string; make: () => SegDraft }
export const TEMPLATES: Template[] = [
  { label: "Warm-up", make: () => newFlat("warmup") },
  { label: "Cool-down", make: () => newFlat("cooldown") },
  { label: "Intervals 1:1 · 30/30 x 4", make: () => newSeg("interval", { ...intervalDefaults("resistance"), ratio: "1:1", workSec: "30", restSec: "30", rounds: "4" }) },
  { label: "Tabata 2:1 · 40/20 x 4", make: () => newSeg("interval", { ...intervalDefaults("sprint"), name: "Tabata", ratio: "2:1", workSec: "40", restSec: "20", rounds: "4" }) },
  { label: "Hill 4 min · effort 5 to 8", make: () => newSeg("hill", { min: "4", sec: "0", effFrom: "5", effTo: "8" }) },
];

export function emptyDraft(): RideDraft {
  return { name: "", genre: "", vibe: "", playlistUrl: "", eras: [], genres: [], seeds: "", artistOnly: false, segments: [newFlat("warmup"), newFlat("steady"), newFlat("cooldown")], songs: [] };
}

const split = (t: Target | undefined): [string, string] =>
  t === undefined ? ["", ""] : Array.isArray(t) ? (t[0] === t[1] ? [s(t[0]), ""] : [s(t[0]), s(t[1])]) : [s(t), ""];

export function fromRide(r: Ride): RideDraft {
  const songs: SongDraft[] = [];
  const counts: number[] = r.segments.map(() => 0);
  [...(r.tracklist ?? [])].map((t, i) => ({ t, i })).sort((a, b) => a.t.segmentIndex - b.t.segmentIndex || a.i - b.i).forEach(({ t }) => {
    const { segmentIndex, ...rest } = t;
    songs.push({ ...rest, key: uid() });
    counts[segmentIndex]++;
  });
  const segments = r.segments.map((seg, i): SegDraft => {
    const base = newSeg(seg.type, { name: seg.name, cue: seg.cue, songCount: s(counts[i]) });
    if (seg.type === "flat") {
      const [cadMin, cadMax] = split(seg.cadence), [effMin, effMax] = split(seg.effort);
      return { ...base, role: seg.role, min: s(Math.floor(seg.durationSec / 60)), sec: s(seg.durationSec % 60), cadMin, cadMax, effMin, effMax };
    }
    if (seg.type === "hill") {
      const [cadMin, cadMax] = split(seg.cadence);
      return { ...base, min: s(Math.floor(seg.durationSec / 60)), sec: s(seg.durationSec % 60), cadMin, cadMax, effFrom: s(seg.effortFrom), effTo: s(seg.effortTo), stepSec: seg.stepSec ? s(seg.stepSec) : "" };
    }
    const [wc0, wc1] = split(seg.work.cadence), [we0, we1] = split(seg.work.effort), [rc0, rc1] = split(seg.rest.cadence), [re0, re1] = split(seg.rest.effort);
    return {
      ...base, workKind: seg.workKind, ratio: seg.ratio, workSec: s(seg.workSec), restSec: s(seg.restSec), rounds: s(seg.rounds), adjust: s(seg.finalRestAdjustSec ?? 0),
      wCadMin: wc0, wCadMax: wc1, wEffMin: we0, wEffMax: we1, rCadMin: rc0, rCadMax: rc1, rEffMin: re0, rEffMax: re1,
    };
  });
  return {
    name: r.name, genre: r.genre ?? "", vibe: r.vibe ?? "", playlistUrl: r.playlistUrl ?? "", eras: r.eras ?? [], genres: r.genres ?? [], seeds: r.seeds ?? "", artistOnly: r.artistOnly === true,
    segments, songs, stretches: r.stretches, sourceId: r.sourceId,
  };
}

// ---- parsing the form -------------------------------------------------------
function numIn(v: string, label: string, min: number, max: number, whole = false): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < min || n > max || (whole && !Number.isInteger(n))) throw new Error(`${label} must be ${whole ? "a whole number " : "a number "}from ${min} to ${max}`);
  return n;
}
function rangeIn(lo: string, hi: string, label: string, min: number, max: number, whole = false): Target {
  const a = numIn(lo, `${label} min`, min, max, whole);
  const b = numIn(hi, `${label} max`, min, max, whole);
  if (a === undefined) throw new Error(`${label}: fill in the number`);
  if (b === undefined || b === a) return a;
  if (b < a) throw new Error(`${label}: max can't be lower than min`);
  return [a, b];
}
const cad = (lo: string, hi: string, l: string) => rangeIn(lo, hi, `${l} cadence`, 1, 250);
const eff = (lo: string, hi: string, l: string) => rangeIn(lo, hi, `${l} effort`, 1, 10, true);
const dur = (d: SegDraft) => (numIn(d.min, "Minutes", 0, 360, true) ?? 0) * 60 + (numIn(d.sec, "Seconds", 0, 59, true) ?? 0);

/** One draft segment as a v2 segment. `fit` leaves durations/rounds as placeholders for the fitter to fill. */
export function segFromDraft(d: SegDraft): RideSegment {
  const name = d.name.trim() || (d.type === "hill" ? "Hill" : d.type === "interval" ? "Intervals" : "Flat road");
  if (d.type === "flat") {
    return { type: "flat", role: d.role, name, durationSec: dur(d), cadence: cad(d.cadMin, d.cadMax, name), effort: eff(d.effMin, d.effMax, name), cue: d.cue };
  }
  if (d.type === "hill") {
    const from = numIn(d.effFrom, `${name} effort from`, 1, 10, true), to = numIn(d.effTo, `${name} effort to`, 1, 10, true);
    if (from === undefined || to === undefined) throw new Error(`${name}: fill in effort from and to`);
    const step = numIn(d.stepSec, "Step seconds", 1, 3600, true);
    return { type: "hill", name, durationSec: dur(d), cadence: cad(d.cadMin, d.cadMax, name), effortFrom: from, effortTo: to, ...(step ? { stepSec: step } : {}), cue: d.cue };
  }
  const w = numIn(d.workSec, "Work seconds", 1, 3600, true), r = numIn(d.restSec, "Rest seconds", 1, 3600, true), n = numIn(d.rounds, "Rounds", 1, 60, true);
  if (!w || !r || !n) throw new Error(`${name}: work seconds, rest seconds and rounds are needed`);
  const adj = numIn(d.adjust, "Last-rest adjust", -3600, 3600, true) ?? 0;
  return {
    type: "interval", name, workKind: d.workKind, ratio: d.ratio, workSec: w, restSec: r, rounds: n, ...(adj ? { finalRestAdjustSec: adj } : {}),
    work: { cadence: cad(d.wCadMin, d.wCadMax, `${name} work`), effort: eff(d.wEffMin, d.wEffMax, `${name} work`) },
    rest: { cadence: cad(d.rCadMin, d.rCadMax, `${name} rest`), effort: eff(d.rEffMin, d.rEffMax, `${name} rest`) },
    cue: d.cue,
  };
}

const count = (d: SegDraft) => Math.max(0, Math.floor(Number(d.songCount) || 0));

/** Songs by segment: segment i takes the next songCount songs. */
export function assignSongs(d: RideDraft): SongDraft[][] {
  let at = 0;
  return d.segments.map((seg) => {
    const n = count(seg);
    const part = d.songs.slice(at, at + n);
    at += n;
    return part;
  });
}

/** Draft to a validated v2 ride. Throws Error with a message that names the segment. */
export function toRide(d: RideDraft, id = ""): Ride {
  const segments = d.segments.map((seg, i) => {
    try { return segFromDraft(seg); } catch (e) { throw new Error(`Segment ${i + 1}: ${(e as Error).message}`); }
  });
  const tracklist: RideTrack[] = [];
  const parts = assignSongs(d);
  // Songs beyond what the segments cover (music may run longer than the ride) ride along with the last segment.
  const used = parts.reduce((n, p) => n + p.length, 0);
  if (parts.length) parts[parts.length - 1] = [...parts[parts.length - 1], ...d.songs.slice(used)];
  parts.forEach((part, i) => part.forEach(({ key: _k, ...t }) => tracklist.push({ ...t, segmentIndex: i })));
  return parseRideV2({
    schemaVersion: 2, id, sourceId: d.sourceId, name: d.name, genre: d.genre, vibe: d.vibe, playlistUrl: d.playlistUrl,
    eras: d.eras, genres: d.genres, seeds: d.seeds, artistOnly: d.artistOnly || undefined,
    segments, tracklist: tracklist.length ? tracklist : undefined, stretches: d.stretches,
  });
}

// ---- totals and warnings ----------------------------------------------------
export interface Totals { segmentSec: number; musicSec: number; songsMissing: number; stretchSec: number; ride?: Ride; error?: string; warnings: Warning[] }

/** Estimated stretch time: each hold plus a few seconds to switch sides. */
export const stretchEstimate = (stretches: Stretch[] = DEFAULT_STRETCHES) => stretches.reduce((t, x) => t + x.holdSec + 5, 0);

export function draftTotals(d: RideDraft): Totals {
  const base: Totals = {
    segmentSec: 0, musicSec: d.songs.reduce((t, x) => t + (x.durationSec ?? 0), 0), songsMissing: d.songs.filter((x) => x.durationSec === undefined).length,
    stretchSec: stretchEstimate(stretchesFor({ stretches: d.stretches })), warnings: [],
  };
  const parts: number[] = [];
  let firstError = "";
  d.segments.forEach((seg, i) => {
    try { parts.push(segmentDuration(segFromDraft(seg))); } catch (e) { if (!firstError) firstError = `Segment ${i + 1}: ${(e as Error).message}`; }
  });
  base.segmentSec = parts.reduce((a, b) => a + b, 0);
  if (firstError) return { ...base, error: firstError };
  try {
    const ride = toRide({ ...d, name: d.name || "x" });
    return { ...base, segmentSec: rideDuration(ride), ride, warnings: validateRide(ride) };
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

// ---- moving things around keeps songs with their segment --------------------
function sliceBounds(d: RideDraft, i: number): [number, number] {
  const start = d.segments.slice(0, i).reduce((t, x) => t + count(x), 0);
  return [start, start + count(d.segments[i])];
}

export function moveSeg(d: RideDraft, from: number, to: number): RideDraft {
  if (to < 0 || to >= d.segments.length || from === to) return d;
  const [a, b] = sliceBounds(d, from);
  const mine = d.songs.slice(a, b);
  const rest = [...d.songs.slice(0, a), ...d.songs.slice(b)];
  const segments = d.segments.slice();
  const [seg] = segments.splice(from, 1);
  segments.splice(to, 0, seg);
  const before = segments.slice(0, to).reduce((t, x) => t + count(x), 0);
  return { ...d, segments, songs: [...rest.slice(0, before), ...mine, ...rest.slice(before)] };
}

export function deleteSeg(d: RideDraft, i: number): RideDraft {
  const [a, b] = sliceBounds(d, i);
  return { ...d, segments: d.segments.filter((_, j) => j !== i), songs: [...d.songs.slice(0, a), ...d.songs.slice(b)] };
}

export function duplicateSeg(d: RideDraft, i: number): RideDraft {
  const segments = d.segments.slice();
  segments.splice(i + 1, 0, { ...d.segments[i], key: uid(), songCount: "0" });
  return { ...d, segments };
}

// ---- songs ------------------------------------------------------------------
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const same = (a: { artist: string; title: string }, b: { artist: string; title: string }) => norm(a.artist) === norm(b.artist) && norm(a.title) === norm(b.title);

/** Pasted songs: ones already in the list get their length updated (so pasting lengths back works); new ones are appended. */
export function mergeSongs(existing: SongDraft[], incoming: Song[]): { songs: SongDraft[]; added: number; updated: number } {
  const songs = existing.map((x) => ({ ...x }));
  let added = 0, updated = 0;
  for (const n of incoming) {
    const hit = songs.find((x) => same(x, n));
    if (hit) {
      hit.durationSec = n.durationSec;
      hit.durationSource = n.durationSource;
      updated++;
    } else {
      songs.push({ key: uid(), title: n.title, artist: n.artist, durationSec: n.durationSec, durationSource: n.durationSource });
      added++;
    }
  }
  return { songs, added, updated };
}

export interface FitOutcome { draft: RideDraft; errors: string[]; warnings: Warning[]; unused: number }

/** Lay the segments over the songs: segment lengths come from the songs. Never guesses a missing length. */
export function applyFit(d: RideDraft): FitOutcome {
  let templates: FitTemplate[];
  try {
    templates = d.segments.map((seg, i): FitTemplate => {
      let full: RideSegment;
      try { full = segFromDraft({ ...seg, min: "0", sec: "1", rounds: "1", adjust: "0" }); } catch (e) { throw new Error(`Segment ${i + 1}: ${(e as Error).message}`); }
      if (full.type === "flat") { const { durationSec: _d, ...rest } = full; return { ...rest, songs: Math.max(1, count(seg)) }; }
      if (full.type === "hill") { const { durationSec: _d, stepSec: _s, ...rest } = full; return rest; }
      const { rounds: _r, finalRestAdjustSec: _a, ...rest } = full; return rest;
    });
  } catch (e) {
    return { draft: d, errors: [(e as Error).message], warnings: [], unused: 0 };
  }
  const needed = templates.reduce((n, x) => n + (x.type === "flat" ? Math.max(1, x.songs ?? 1) : 1), 0);
  if (d.songs.length < needed) {
    return { draft: d, errors: [`Fit needs ${needed} songs: one for each hill and interval, and the Songs count on each flat segment (at least 1). You have ${d.songs.length}. Add songs, or lower a flat segment's Songs count.`], warnings: [], unused: 0 };
  }
  const songs: Song[] = d.songs.map((x) => ({ title: x.title, artist: x.artist, durationSec: x.durationSec, durationSource: x.durationSource }));
  const fit = fitSegmentsToSongs(songs, templates);
  if (!fit.ok) return { draft: d, errors: fit.errors, warnings: fit.warnings, unused: 0 };
  const segments = d.segments.map((seg, i): SegDraft => {
    const f = fit.segments[i];
    if (f.type === "interval") return { ...seg, rounds: s(f.rounds), adjust: s(f.finalRestAdjustSec ?? 0), songCount: "1" };
    if (f.type === "hill") return { ...seg, min: s(Math.floor(f.durationSec / 60)), sec: s(f.durationSec % 60), stepSec: "", songCount: "1" };
    return { ...seg, min: s(Math.floor(f.durationSec / 60)), sec: s(f.durationSec % 60), songCount: s(Math.max(1, count(seg))) };
  });
  return { draft: { ...d, segments }, errors: [], warnings: fit.warnings, unused: fit.unused.length };
}


// ---- the music tab works on the same songs ---------------------------------
import type { Track } from "./types";

/** The draft's songs as v1-shaped tracks (what the music planner speaks), with their segment. */
export function tracksFromDraft(d: RideDraft): Track[] {
  const parts = assignSongs(d);
  const used = parts.reduce((n, p) => n + p.length, 0);
  if (parts.length) parts[parts.length - 1] = [...parts[parts.length - 1], ...d.songs.slice(used)];
  return parts.flatMap((part, i) => part.map(({ key: _k, ...t }): Track => ({ ...t, segmentIndex: i })));
}

/**
 * Tracks coming back from the planner replace the draft's songs. A song that was already there keeps its real length;
 * each segment's song count follows the planner (so a hill or interval ends up with its one song).
 */
export function applyTracks(d: RideDraft, tracks: Track[]): RideDraft {
  const sorted = tracks.map((t, i) => ({ t, i })).sort((a, b) => a.t.segmentIndex - b.t.segmentIndex || a.i - b.i).map((x) => x.t);
  const songs: SongDraft[] = sorted.map(({ segmentIndex: _s, ...t }) => {
    const old = d.songs.find((x) => same(x, t));
    return { ...t, key: old?.key ?? uid(), ...(old?.durationSec !== undefined ? { durationSec: old.durationSec, durationSource: old.durationSource } : {}) };
  });
  const counts = d.segments.map((_, i) => sorted.filter((t) => t.segmentIndex === i).length);
  return { ...d, songs, segments: d.segments.map((seg, i) => ({ ...seg, songCount: String(counts[i]) })) };
}
