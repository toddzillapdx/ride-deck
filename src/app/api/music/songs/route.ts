import Anthropic from "@anthropic-ai/sdk";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { PlannerError } from "@/lib/planner";
import { planSongs, type SongPlanInput } from "@/lib/songPlanner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sha = (s: string) => createHash("sha256").update(s).digest();
function authorized(req: Request): boolean {
  const want = process.env.PLANNER_PASSCODE;
  if (!want) return true;
  return timingSafeEqual(sha(req.headers.get("x-planner-passcode") ?? ""), sha(want));
}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Song-first planning. Body: styles, targetMin, count; optional `slot` (one song), `keep`, `avoid`. */
export async function POST(req: Request) {
  if (!authorized(req)) return bad("passcode", 401);
  if (!process.env.ANTHROPIC_API_KEY) return bad("ANTHROPIC_API_KEY is not set", 503);
  const text = await req.text();
  if (text.length > 100_000) return bad("Request too large", 413);

  let input: SongPlanInput;
  try {
    const b = JSON.parse(text) as Record<string, unknown>;
    const labels = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 12).map((x) => x.trim().slice(0, max)) : []);
    const vibe = typeof b.vibe === "string" ? b.vibe.trim().slice(0, 40) : "";
    if (!vibe) throw new Error("vibe is required");
    const seeds = typeof b.seeds === "string" ? b.seeds.trim().slice(0, 300) : "";
    const artistOnly = b.artistOnly === true;
    if (artistOnly && !seeds) throw new Error("Type an artist or a song in Sounds like first.");
    const targetMin = Number(b.targetMin);
    if (!Number.isInteger(targetMin) || targetMin < 10 || targetMin > 90) throw new Error("targetMin must be a whole number from 10 to 90");
    const count = Number.isInteger(b.count) ? (b.count as number) : 0;
    const avoid = Array.isArray(b.avoid) ? b.avoid.filter((s): s is string => typeof s === "string").slice(0, 150).map((s) => s.slice(0, 120)) : [];
    const keep = Array.isArray(b.keep)
      ? (b.keep as Record<string, unknown>[]).slice(0, 60).filter((k) => typeof k?.title === "string" && typeof k?.artist === "string").map((k) => ({ title: String(k.title).slice(0, 120), artist: String(k.artist).slice(0, 120) }))
      : [];
    let slot: SongPlanInput["slot"];
    if (b.slot && typeof b.slot === "object") {
      const s = b.slot as Record<string, unknown>;
      const index = Number(s.index), total = Number(s.total);
      if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 2 || index >= total || total > 60) throw new Error("slot needs index and total");
      const want = Number(s.wantSec);
      slot = {
        index, total,
        ...(typeof s.before === "string" ? { before: s.before.slice(0, 200) } : {}), ...(typeof s.after === "string" ? { after: s.after.slice(0, 200) } : {}),
        ...(Number.isFinite(want) && want >= 60 && want <= 900 ? { wantSec: Math.round(want) } : {}),
      };
    } else if (count < 4 || count > 34) throw new Error("count must be from 4 to 34");
    const spares = Number.isInteger(b.spares) && (b.spares as number) >= 0 && (b.spares as number) <= 8 ? (b.spares as number) : 0;
    input = { eras: labels(b.eras, 20), genres: labels(b.genres, 30), vibe, seeds, artistOnly, targetMin, count: slot ? 1 : count, spares: slot ? 0 : spares, avoid, keep, ...(slot ? { slot } : {}) };
  } catch (e) {
    return bad(e instanceof SyntaxError ? "Body must be JSON" : (e as Error).message);
  }

  try {
    return NextResponse.json(await planSongs(new Anthropic(), input));
  } catch (e) {
    if (e instanceof PlannerError) return bad(e.message, e.status);
    if (e instanceof Anthropic.AuthenticationError) return bad("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel.", 502);
    if (e instanceof Anthropic.RateLimitError) return bad("Rate limited by Anthropic. Wait a moment and try again.", 429);
    if (e instanceof Anthropic.APIError) return bad(`Anthropic API error (${e.status ?? "?"}). Try again.`, 502);
    return bad("Couldn't plan the songs. Try again.", 502);
  }
}
