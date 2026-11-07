import Anthropic from "@anthropic-ai/sdk";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { parseWorkout } from "@/lib/validate";
import { PlannerError, planTracks, type PlanInput } from "@/lib/planner";
import type { Track } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 100_000;
const sha = (s: string) => createHash("sha256").update(s).digest();

/** Optional gate. If PLANNER_PASSCODE is set in Vercel, requests must send it. Keeps strangers from spending your API credit. */
function authorized(req: Request): boolean {
  const want = process.env.PLANNER_PASSCODE;
  if (!want) return true;
  return timingSafeEqual(sha(req.headers.get("x-planner-passcode") ?? ""), sha(want));
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

function keepTracks(v: unknown, segCount: number): Track[] {
  if (!Array.isArray(v) || v.length > 100) throw new Error("keep must be an array of up to 100 tracks");
  return v.map((r, i) => {
    const t = (r ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(t.segmentIndex) || (t.segmentIndex as number) < 0 || (t.segmentIndex as number) >= segCount) throw new Error(`keep[${i}] has a bad segmentIndex`);
    if (typeof t.title !== "string" || typeof t.artist !== "string") throw new Error(`keep[${i}] needs title and artist`);
    return {
      segmentIndex: t.segmentIndex as number, title: t.title.slice(0, 120), artist: t.artist.slice(0, 120),
      ...(typeof t.approxDurationSec === "number" ? { approxDurationSec: t.approxDurationSec } : {}),
      ...(typeof t.genre === "string" ? { genre: t.genre.slice(0, 40) } : {}),
      ...(typeof t.era === "string" ? { era: t.era.slice(0, 40) } : {}),
    };
  });
}

export async function POST(req: Request) {
  if (!authorized(req)) return bad("passcode", 401);
  if (!process.env.ANTHROPIC_API_KEY) return bad("ANTHROPIC_API_KEY is not set", 503);

  const text = await req.text();
  if (text.length > MAX_BODY) return bad("Request too large", 413);

  let input: PlanInput;
  try {
    const b = JSON.parse(text) as Record<string, unknown>;
    const workout = parseWorkout(b.workout);
    if (workout.segments.length > 40) throw new Error("Too many segments to plan (max 40)");
    const labels = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 12).map((x) => x.trim().slice(0, max)) : []);
    const vibe = typeof b.vibe === "string" ? b.vibe.trim().slice(0, 40) : "";
    if (!vibe) throw new Error("vibe is required");
    // `genre` (a single string) is accepted for older clients.
    const genres = Array.isArray(b.genres) ? labels(b.genres, 30) : typeof b.genre === "string" && b.genre.trim() ? [b.genre.trim().slice(0, 30)] : [];
    const eras = labels(b.eras, 20);
    const seeds = typeof b.seeds === "string" ? b.seeds.trim().slice(0, 300) : "";
    const artistOnly = b.artistOnly === true;
    if (artistOnly && !seeds) throw new Error("Type an artist or a song in Sounds like first.");
    const regenerate = Array.isArray(b.regenerate) ? b.regenerate.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < workout.segments.length) : [];
    if (!regenerate.length) throw new Error("regenerate must list at least one segment");
    const avoid = Array.isArray(b.avoid) ? b.avoid.filter((s): s is string => typeof s === "string").slice(0, 150).map((s) => s.slice(0, 120)) : [];
    const exactly = Number.isInteger(b.exactly) && (b.exactly as number) >= 1 && (b.exactly as number) <= 5 ? (b.exactly as number) : undefined;
    input = { workout, genres, eras, vibe, seeds, artistOnly, regenerate, avoid, ...(exactly ? { exactly } : {}), keep: keepTracks(b.keep ?? [], workout.segments.length) };
  } catch (e) {
    return bad(e instanceof SyntaxError ? "Body must be JSON" : (e as Error).message);
  }

  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    return NextResponse.json(await planTracks(client, input));
  } catch (e) {
    if (e instanceof PlannerError) return bad(e.message, e.status);
    if (e instanceof Anthropic.AuthenticationError) return bad("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel.", 502);
    if (e instanceof Anthropic.RateLimitError) return bad("Rate limited by Anthropic. Wait a moment and try again.", 429);
    if (e instanceof Anthropic.APIError) return bad(`Anthropic API error (${e.status ?? "?"}). Try again.`, 502);
    return bad("Couldn't plan the tracklist. Try again.", 502);
  }
}
