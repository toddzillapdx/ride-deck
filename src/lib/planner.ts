import type Anthropic from "@anthropic-ai/sdk";
import type { Track, Workout } from "./types";
import { songSec } from "./music";

/** Server-side only. Builds the prompt, calls Claude, and sanitizes what comes back. */
export const PLANNER_MODEL = "claude-opus-5-5";

export interface PlanInput {
  workout: Workout;
  genre: string;
  vibe: string;
  /** Tracks that stay. Locked songs and every song in segments not being regenerated. */
  keep: Track[];
  /** Titles of songs being replaced, so a swap doesn't hand the same song back. */
  avoid: string[];
  /** Segment indexes to (re)fill. */
  regenerate: number[];
}

export interface SegmentNeed {
  segmentIndex: number;
  name: string;
  type: string;
  durationSec: number;
  needSec: number;
  cadence?: string;
  resistance?: string;
  cue: string;
}

const fmt = (t: Workout["segments"][number]["cadence"]) => (t === undefined ? undefined : Array.isArray(t) ? `${t[0]}-${t[1]}` : `${t}`);

export function segmentNeeds(input: PlanInput): SegmentNeed[] {
  const out: SegmentNeed[] = [];
  for (const i of [...new Set(input.regenerate)].sort((a, b) => a - b)) {
    const s = input.workout.segments[i];
    if (!s) continue;
    const kept = input.keep.filter((t) => t.segmentIndex === i).reduce((n, t) => n + songSec(t), 0);
    const needSec = Math.max(0, s.durationSec - kept);
    if (kept > 0 && needSec < 45) continue; // already full
    out.push({ segmentIndex: i, name: s.name, type: s.type, durationSec: s.durationSec, needSec, cadence: fmt(s.cadence), resistance: fmt(s.resistance), cue: s.cue });
  }
  return out;
}

const VIBE_NOTES: Record<string, string> = {
  "Classic": "well-known songs that have stood the test of time (roughly 1970s to early 2000s)",
  "High energy": "upbeat, driving songs with strong momentum",
  "Recent": "songs from roughly the last five to ten years that you are confident exist",
};

export const SYSTEM_PROMPT = `You build cycling playlists for a stationary-bike ride coach.

You are given the segments of one ride (type, length, target cadence in RPM, target resistance 0-100). Pick real songs to pace each segment.

Pacing:
- warmup, recover and cooldown segments want slower, steadier songs.
- flat segments want a steady mid-tempo groove.
- climb segments are heavy and slow: pick songs with a heavy, deliberate, plodding feel. Tempos near the target cadence, or double it, work well.
- sprint segments want the fastest, most explosive songs.
- Songs should roughly fill the time needed for each segment. A song may be 3 to 5 minutes. Use one song for a segment of 3 to 6 minutes and more for longer ones.
- Segments under about 2 minutes do not need their own song. Return no tracks for them when the previous song can carry through.

Accuracy:
- Only suggest real songs you are confident exist and are performed by the artist you name. If you are unsure, choose a different song. Never invent a title or an artist.
- approxBpm is your best estimate and is not verified. approxDurationSec is the approximate length of the original recording.
- Do not repeat a song, and avoid more than two songs by one artist across the whole playlist, counting the songs already chosen.
- Keep each reason to one short sentence about why the song fits the segment.`;

export function buildUserMessage(input: PlanInput, needs: SegmentNeed[]): string {
  const lines: string[] = [];
  lines.push(`Ride: ${input.workout.name} (${Math.round(input.workout.segments.reduce((n, s) => n + s.durationSec, 0) / 60)} minutes)`);
  lines.push(`Genre: ${input.genre}`);
  lines.push(`Vibe: ${input.vibe}${VIBE_NOTES[input.vibe] ? ` (${VIBE_NOTES[input.vibe]})` : ""}`);
  lines.push("", "Segments to fill:");
  for (const n of needs) {
    lines.push(
      `- segmentIndex ${n.segmentIndex}: ${n.name}, type ${n.type}, ${n.durationSec}s long, needs about ${n.needSec}s of songs` +
        `${n.cadence ? `, cadence ${n.cadence} RPM` : ""}${n.resistance ? `, resistance ${n.resistance}` : ""}${n.cue ? `, cue: "${n.cue}"` : ""}`,
    );
  }
  if (input.keep.length) {
    lines.push("", "Songs already chosen (do not repeat these or their artists more than once more):");
    for (const t of input.keep) lines.push(`- ${t.artist} - ${t.title} (segment ${t.segmentIndex})`);
  }
  if (input.avoid.length) lines.push("", `Do not suggest these again: ${input.avoid.join("; ")}`);
  lines.push("", "Return tracks only for the segmentIndex values listed above.");
  return lines.join("\n");
}

export const TRACKS_SCHEMA = {
  type: "object",
  properties: {
    tracks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          segmentIndex: { type: "integer" },
          title: { type: "string" },
          artist: { type: "string" },
          approxBpm: { type: "integer" },
          approxDurationSec: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["segmentIndex", "title", "artist", "approxBpm", "approxDurationSec", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["tracks"],
  additionalProperties: false,
} as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Never trust model output: keep only requested segments, drop repeats and junk, clamp numbers. */
export function sanitize(raw: unknown, input: PlanInput, needs: SegmentNeed[]): Track[] {
  const allowed = new Set(needs.map((n) => n.segmentIndex));
  const seen = new Set(input.keep.map((t) => norm(`${t.artist} ${t.title}`)));
  for (const a of input.avoid) seen.add(`avoid ${norm(a)}`);
  const list = (raw as { tracks?: unknown })?.tracks;
  if (!Array.isArray(list)) throw new Error("The planner returned an unexpected format");
  const out: Track[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const segmentIndex = Number(r?.segmentIndex);
    const title = clean(r?.title, 120);
    const artist = clean(r?.artist, 120);
    if (!allowed.has(segmentIndex) || !title || !artist) continue;
    const key = norm(`${artist} ${title}`);
    if (seen.has(key) || seen.has(`avoid ${norm(title)}`)) continue;
    seen.add(key);
    const bpm = Number(r.approxBpm);
    const dur = Number(r.approxDurationSec);
    const reason = clean(r.reason, 200);
    out.push({
      segmentIndex, title, artist,
      ...(Number.isFinite(bpm) && bpm > 0 ? { approxBpm: clamp(bpm, 40, 220) } : {}),
      ...(Number.isFinite(dur) && dur > 0 ? { approxDurationSec: clamp(dur, 60, 600) } : {}),
      ...(reason ? { reason } : {}),
    });
  }
  return out;
}

export class PlannerError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

type Client = Pick<Anthropic, "beta">;

export async function planTracks(client: Client, input: PlanInput): Promise<Track[]> {
  const needs = segmentNeeds(input);
  if (!needs.length) return [];

  const response = await client.beta.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 6000,
    // Refusals are rare for music, but a server-side fallback costs nothing when unused.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input, needs) }],
    output_config: { effort: "low", format: { type: "json_schema", schema: TRACKS_SCHEMA as unknown as Record<string, unknown> } },
  });

  if (response.stop_reason === "refusal") throw new PlannerError("Claude declined this request. Try a different genre or vibe.", 422);
  if (response.stop_reason === "max_tokens") throw new PlannerError("The tracklist was cut off. Try regenerating fewer segments at once.");
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new PlannerError("The planner returned no tracklist");
  let parsed: unknown;
  try { parsed = JSON.parse(block.text); } catch { throw new PlannerError("The planner returned invalid JSON"); }
  return sanitize(parsed, input, needs);
}
