import { clampEffort } from "./effort";
import { MIN_FINAL_REST_SEC, type FlatRole, type Ride, type RideSegment, type RideTrack, type Target } from "./types";

/** The v1 shapes, as stored in Airtable before V1.5. */
export interface V1Segment {
  name: string;
  type: "warmup" | "flat" | "climb" | "sprint" | "recover" | "cooldown";
  durationSec: number;
  cadence?: Target;
  resistance?: Target;
  cue?: string;
  pacing?: "auto" | "steady" | "intervals" | "ramp";
}
export interface V1Workout {
  id?: string;
  name: string;
  segments: V1Segment[];
  tracklist?: { segmentIndex: number; title: string; artist: string; approxBpm?: number; approxDurationSec?: number; reason?: string; genre?: string; era?: string }[];
  [k: string]: unknown;
}

/** How a v1 sprint block becomes a v2 interval. "flat" is the brief's mechanical fallback. */
export type SprintMode = "30/30" | "40/20" | "flat";

export interface ConvertOptions {
  sprint?: SprintMode;
}

export interface Flag {
  segmentIndex: number;
  message: string;
}

export interface Conversion {
  ride: Ride;
  flags: Flag[];
  /** Old and new values per segment, for the review table. */
  rows: { segmentIndex: number; name: string; oldType: string; old: string; new: string; flags: string[] }[];
}

const RAMP_PER_MIN = 5; // v1 pacing.ts
const RAMP_MAX_RISE = 25;
const SPRINT_FLOOR = 8;
/** A sprint interval is about fast legs, not heavy resistance: effort 4 to 6. */
const SPRINT_INTERVAL_EFFORT: Target = [4, 6];
const SPRINT_CADENCE = 100;
const REST_CUE = { cadence: [70, 80] as [number, number], effort: [2, 3] as [number, number] };

/** Round half up. */
const r10 = (n: number) => Math.floor(n / 10 + 0.5);
const mid = (t: Target) => (Array.isArray(t) ? (t[0] + t[1]) / 2 : t);
const lo = (t: Target) => (Array.isArray(t) ? t[0] : t);
const hi = (t: Target) => (Array.isArray(t) ? t[1] : t);
const show = (t?: Target) => (t === undefined ? "-" : Array.isArray(t) ? `${t[0]}-${t[1]}` : String(t));
const collapse = (a: number, b: number): Target => (a === b ? a : [a, b]);

function effortOf(res: Target | undefined, sprintLike: boolean): Target {
  const base = res === undefined ? 5 : null;
  if (base !== null) return base;
  let a = clampEffort(r10(lo(res as Target)));
  let b = clampEffort(r10(hi(res as Target)));
  if (sprintLike) { a = Math.max(a, SPRINT_FLOOR); b = Math.max(b, SPRINT_FLOOR); }
  return collapse(a, b);
}

const ROLE: Record<string, FlatRole> = { warmup: "warmup", cooldown: "cooldown", flat: "steady", recover: "recover" };

/** Converts one v1 workout to v2, mechanically, and says what needs a human look. */
export function convertV1(w: V1Workout, opts: ConvertOptions = {}): Conversion {
  const sprintMode = opts.sprint ?? "30/30";
  const flags: Flag[] = [];
  const rows: Conversion["rows"] = [];
  const flag = (i: number, m: string, rowFlags: string[]) => { flags.push({ segmentIndex: i, message: m }); rowFlags.push(m); };

  const segments: RideSegment[] = w.segments.map((s, i): RideSegment => {
    const f: string[] = [];
    const cadence: Target = s.cadence ?? [70, 80];
    const cue = s.cue ?? "";
    const old = `${s.durationSec}s cad ${show(s.cadence)} res ${show(s.resistance)}`;
    let out: RideSegment;

    if (s.type === "climb") {
      // What he actually rode: a v1 climb ramps up to the block's resistance (the peak), +5 a minute, at most +25.
      const res = s.resistance ?? 60;
      const n = Math.max(1, Math.round(s.durationSec / 60));
      const rise = Math.min(RAMP_PER_MIN * Math.max(0, n - 1), RAMP_MAX_RISE);
      const to = clampEffort(r10(mid(res)));
      let from = clampEffort(r10(mid(res) - rise));
      let eTo = to;
      if (from >= eTo) {
        eTo = Math.min(10, from + 1);
        if (from >= eTo) from = Math.max(1, eTo - 1);
        flag(i, "climb was too short or flat to ramp; effort range widened by 1", f);
      }
      out = { type: "hill", name: s.name, durationSec: s.durationSec, cadence, effortFrom: from, effortTo: eTo, cue };
    } else if (s.type === "sprint" && sprintMode !== "flat") {
      const [workSec, restSec, ratio] = sprintMode === "30/30" ? [30, 30, "1:1" as const] : [40, 20, "2:1" as const];
      const cycle = workSec + restSec;
      let rounds = Math.max(1, Math.round(s.durationSec / cycle));
      let adj = s.durationSec - rounds * cycle;
      if (restSec + adj < MIN_FINAL_REST_SEC && rounds > 1) { rounds -= 1; adj = s.durationSec - rounds * cycle; }
      const eff = effortOf(s.resistance, true);
      out = {
        type: "interval", name: s.name, workKind: "sprint", ratio, workSec, restSec, rounds,
        ...(adj !== 0 ? { finalRestAdjustSec: adj } : {}),
        work: { cadence, effort: SPRINT_INTERVAL_EFFORT },
        rest: REST_CUE, cue,
      };
      flag(i, `sprint block became ${sprintMode} x ${rounds}; confirm the ratio and rounds`, f);
    } else {
      const sprintLike = s.type === "sprint" || mid(cadence) >= SPRINT_CADENCE;
      const effort = s.type === "sprint" ? collapse(8, 9) : effortOf(s.resistance, sprintLike);
      out = { type: "flat", role: s.type === "sprint" ? "steady" : ROLE[s.type] ?? "steady", name: s.name, durationSec: s.durationSec, cadence, effort, cue };
      if (s.type === "sprint") flag(i, "sprint became a steady block at effort 8-9; should usually be a real interval", f);
      else if (sprintLike) f.push("effort floored at 8 (high cadence)");
    }
    if (s.pacing && s.pacing !== "auto" && s.pacing !== (s.type === "sprint" ? "intervals" : s.type === "climb" ? "ramp" : "steady")) {
      flag(i, `v1 pacing "${s.pacing}" is not carried over`, f);
    }
    const nw = out.type === "flat" ? `flat/${out.role} cad ${show(out.cadence)} eff ${show(out.effort)}`
      : out.type === "hill" ? `hill ${out.effortFrom}->${out.effortTo} cad ${show(out.cadence)}`
      : `interval ${out.ratio} ${out.workSec}/${out.restSec} x${out.rounds}${out.finalRestAdjustSec ? ` adj ${out.finalRestAdjustSec}` : ""} work eff ${show(out.work.effort)}`;
    rows.push({ segmentIndex: i, name: s.name, oldType: s.type, old, new: nw, flags: f });
    return out;
  });

  // Estimated lengths stay as estimates; Fit refuses them.
  const tracklist: RideTrack[] | undefined = w.tracklist?.map((t) => ({
    segmentIndex: t.segmentIndex, title: t.title, artist: t.artist,
    ...(t.approxBpm !== undefined ? { approxBpm: t.approxBpm } : {}),
    ...(t.approxDurationSec !== undefined ? { approxDurationSec: t.approxDurationSec } : {}),
    ...(t.reason ? { reason: t.reason } : {}),
    ...(t.genre ? { genre: t.genre } : {}),
    ...(t.era ? { era: t.era } : {}),
  }));

  const keep = ["genre", "vibe", "eras", "genres", "seeds", "artistOnly", "playlistUrl"] as const;
  const carried: Record<string, unknown> = {};
  for (const k of keep) if (w[k] !== undefined) carried[k] = w[k];

  const ride: Ride = { schemaVersion: 2, id: w.id ?? "", name: w.name, ...carried, segments, ...(tracklist ? { tracklist } : {}) } as Ride;
  return { ride, flags, rows };
}
