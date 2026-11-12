import { NextResponse } from "next/server";
import { isPlausibleEmail, normalizeEmail } from "@/lib/auth/email";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Most new requests the whole app takes in an hour: a flood stops here instead of filling the table. */
const HOURLY_CAP = 40;

/**
 * "Request an invite". Always answers the same way once the email looks real, so nobody can use it to learn who is invited
 * or who already asked. A hidden field that humans never fill in catches simple bots.
 */
export async function POST(req: Request) {
  let body: { email?: unknown; note?: unknown; website?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  if (!isPlausibleEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const ok = NextResponse.json({ ok: true });
  if (typeof body.website === "string" && body.website.trim()) return ok; // a bot filled the hidden field: pretend it worked
  const note = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, 300) : "";

  try {
    const c = db();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await c.from("invite_requests").select("email", { count: "exact", head: true }).gte("created_at", since);
    if ((count ?? 0) >= HOURLY_CAP) return NextResponse.json({ error: "A lot of people are asking right now. Please try again a bit later." }, { status: 429 });
    const { error } = await c.from("invite_requests").upsert({ email, ...(note ? { note } : {}) }, { onConflict: "email", ignoreDuplicates: true });
    if (error) console.error("invite request not saved:", error.message);
  } catch (e) {
    console.error("invite request failed:", (e as Error).message);
  }
  return ok;
}
