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
    const genre = typeof b.genre === "string" ? b.genre.trim().slice(0, 40) : "";
    const vibe = typeof b.vibe === "string" ? b.vibe.trim().slice(0, 40) : "";
    if (!genre || !vibe) throw new Error("genre and vibe are required");
    const regenerate = Array.isArray(b.regenerate) ? b.regenerate.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < workout.segments.length) : [];
    if (!regenerate.length) throw new Error("regenerate must list at least one segment");
    const avoid = Array.isArray(b.avoid) ? b.avoid.filter((s): s is string => typeof s === "string").slice(0, 100).map((s) => s.slice(0, 120)) : [];
    input = { workout, genre, vibe, regenerate, avoid, keep: keepTracks(b.keep ?? [], workout.segments.length) };
  } catch (e) {
    return bad(e instanceof SyntaxError ? "Body must be JSON" : (e as Error).message);
  }

  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    return NextResponse.json({ tracks: await planTracks(client, input) });
  } catch (e) {
    if (e instanceof PlannerError) return bad(e.message, e.status);
    if (e instanceof Anthropic.AuthenticationError) return bad("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel.", 502);
    if (e instanceof Anthropic.RateLimitError) return bad("Rate limited by Anthropic. Wait a moment and try again.", 429);
    if (e instanceof Anthropic.APIError) return bad(`Anthropic API error (${e.status ?? "?"}). Try again.`, 502);
    return bad("Couldn't plan the tracklist. Try again.", 502);
  }
}
