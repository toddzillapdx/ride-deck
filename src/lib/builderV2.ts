import {
  DEFAULT_STRETCHES, fitSegmentsToSongs, type FitOptions, parseRideV2, rideDuration, segmentDuration, stretchesFor, validateRide,
  type FitTemplate, type FlatRole, type IntervalKind, type IntervalRatio, type Ride, type RideSegment, type RideTrack, type Song, type Stretch, type Target, type Warning,
} from "./engine";

/** Editable form state for the v2 builder. Numbers are strings so half-typed input is representable. */
export type SegType = "flat" | "interval" | "hill";

/** A catalog version of a song, offered when the match is doubtful. */
export interface SongCandidate { id: string; title: string; artist: string; album: string; durationSec: number; rank: number; isrc?: string }

export interface SongDraft extends Omit<RideTrack, "segmentIndex"> {
  key: string;
  /** 1-10 by feel, from the planner. Only used to suggest segment types. */
  intensity?: number;
  locked?: boolean;
  /** Lookup state (never saved). */
  status?: "pending" | "ok" | "cached" | "doubtful" | "missing";
  note?: string;
  candidates?: SongCandidate[];
}

/** The fields of a song that are saved with the ride. */
export function trackOf(x: SongDraft, segmentIndex: number): RideTrack {
  return {
    segmentIndex, title: x.title, artist: x.artist,
    ...(x.durationSec !== undefined ? { durationSec: x.durationSec } : {}), ...(x.durationSource ? { durationSource: x.durationSource } : {}),
    ...(x.album ? { album: x.album } : {}), ...(x.genre ? { genre: x.genre } : {}), ...(x.era ? { era: x.era } : {}), ...(x.reason ? { reason: x.reason } : {}),
    ...(x.approxBpm !== undefined ? { approxBpm: x.approxBpm } : {}),
  };
}

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
  /** Target ride length in minutes (the ride may run up to 2:00 over, never under). */
  targetMin: number;
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
  return { name: "", genre: "", vibe: "Classic", playlistUrl: "", targetMin: 30, eras: [], genres: [], seeds: "", artistOnly: false, segments: [], songs: [] };
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
    name: r.name, genre: r.genre ?? "", vibe: r.vibe ?? "", playlistUrl: r.playlistUrl ?? "", targetMin: Math.min(90, Math.max(10, Math.floor(rideDuration(r) / 60) || 30)), eras: r.eras ?? [], genres: r.genres ?? [], seeds: r.seeds ?? "", artistOnly: r.artistOnly === true,
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
  parts.forEach((part, i) => part.forEach((t) => tracklist.push(trackOf(t, i))));
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
export function applyFit(d: RideDraft, opts: FitOptions = {}): FitOutcome {
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
  const fit = fitSegmentsToSongs(songs, templates, opts);
  if (!fit.ok) return { draft: d, errors: fit.errors, warnings: fit.warnings, unused: 0 };
  const segments = d.segments.map((seg, i): SegDraft => {
    const f = fit.segments[i];
    if (f.type === "interval") return { ...seg, rounds: s(f.rounds), adjust: s(f.finalRestAdjustSec ?? 0), songCount: "1" };
    if (f.type === "hill") return { ...seg, min: s(Math.floor(f.durationSec / 60)), sec: s(f.durationSec % 60), stepSec: "", songCount: "1" };
    return { ...seg, min: s(Math.floor(f.durationSec / 60)), sec: s(f.durationSec % 60), songCount: s(Math.max(1, count(seg))) };
  });
  return { draft: { ...d, segments }, errors: [], warnings: fit.warnings, unused: fit.unused.length };
}


// ---- song-first ride: one song per segment ----------------------------------
import { COOLDOWN_SEC, suggestSegments, type Suggested } from "./songFlow";
import type { PlannedSongLite } from "./songClient";

const mid = (kind: "recover" | "steady"): Partial<SegDraft> => kind === "recover"
  ? { name: "Recover", role: "recover", cadMin: "70", cadMax: "80", effMin: "2", effMax: "3", cue: "Breathe. Let it settle." }
  : { name: "Flat road", role: "steady", cadMin: "85", cadMax: "95", effMin: "4", effMax: "5", cue: "Find a steady rhythm." };

/** A segment draft for a suggested kind. */
export function segmentFor(sg: Suggested): SegDraft {
  if (sg.kind === "flat") {
    if (sg.role === "warmup") return newFlat("warmup");
    if (sg.role === "cooldown") return newFlat("cooldown");
    return newFlat(sg.role, mid(sg.role));
  }
  if (sg.kind === "hill") return newSeg("hill");
  return newSeg("interval", intervalDefaults(sg.work));
}

/** The first segment is the warm-up and the last the cool-down. Everything else is the rider's. */
export function normalizeEnds(d: RideDraft): RideDraft {
  const n = d.segments.length;
  if (!n) return d;
  const segments = d.segments.map((seg, i) => {
    if (i === 0 && !(seg.type === "flat" && seg.role === "warmup")) return { ...newFlat("warmup"), key: seg.key };
    if (i === n - 1 && n > 1 && !(seg.type === "flat" && seg.role === "cooldown")) return { ...newFlat("cooldown"), key: seg.key };
    if (i > 0 && i < n - 1 && seg.type === "flat" && (seg.role === "warmup" || seg.role === "cooldown")) return { ...seg, role: "steady" as FlatRole };
    return seg;
  });
  return { ...d, segments: segments.map((x) => ({ ...x, songCount: "1" })) };
}

/** The planner's songs become the draft's songs, with a suggested segment for each. */
export function setPlanned(d: RideDraft, planned: PlannedSongLite[]): RideDraft {
  const songs: SongDraft[] = planned.map((p) => ({
    key: uid(), title: p.title, artist: p.artist, intensity: p.intensity, genre: p.genre, era: p.era, reason: p.reason, approxDurationSec: p.approxDurationSec, status: "pending",
  }));
  const segments = suggestSegments(songs.map((x) => x.intensity)).map(segmentFor);
  return normalizeEnds({ ...d, songs, segments });
}

export const newSong = (p: PlannedSongLite): SongDraft => ({
  key: uid(), title: p.title, artist: p.artist, intensity: p.intensity, genre: p.genre, era: p.era, reason: p.reason, approxDurationSec: p.approxDurationSec, status: "pending",
});

/** Put a new song at `index` (its segment comes with it, from the song's intensity). */
export function insertSong(d: RideDraft, index: number, song: SongDraft): RideDraft {
  const at = Math.max(0, Math.min(index, d.songs.length));
  const songs = d.songs.slice(); songs.splice(at, 0, song);
  const segments = d.segments.slice();
  const [sg] = suggestSegments([undefined, song.intensity, undefined]).slice(1);
  segments.splice(at, 0, segmentFor(sg));
  return normalizeEnds({ ...d, songs, segments });
}

/** Swap the song at `index` for another; the segment stays, so the rider's settings survive a swap. */
export function replaceSong(d: RideDraft, index: number, song: SongDraft): RideDraft {
  const songs = d.songs.slice(); songs[index] = song;
  return { ...d, songs };
}

export function removeSong(d: RideDraft, index: number): RideDraft {
  return normalizeEnds({ ...d, songs: d.songs.filter((_, i) => i !== index), segments: d.segments.filter((_, i) => i !== index) });
}

/** Copy segment `from`'s settings onto segment `to` (the "stack it again on the next song" move). */
export function repeatSegment(d: RideDraft, from: number, to: number): RideDraft {
  if (!d.segments[from] || !d.segments[to] || from === to) return d;
  const segments = d.segments.slice();
  segments[to] = { ...d.segments[from], key: d.segments[to].key, songCount: "1" };
  return normalizeEnds({ ...d, segments });
}

/** Start every middle segment fresh from the music's intensities. */
export function suggestAll(d: RideDraft): RideDraft {
  const segments = suggestSegments(d.songs.map((x) => x.intensity)).map(segmentFor);
  return normalizeEnds({ ...d, segments });
}

export const aligned = (d: RideDraft) => d.songs.length > 0 && d.songs.length === d.segments.length;

/** The draft with every duration, round count and last-rest derived from the songs. */
export function fitDraft(d: RideDraft): FitOutcome {
  if (!aligned(d)) return { draft: d, errors: ["Plan the songs first: every song gets one segment."], warnings: [], unused: 0 };
  return applyFit(normalizeEnds(d), { cooldownSec: COOLDOWN_SEC });
}
