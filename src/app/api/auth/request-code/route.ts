import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import { isPlausibleEmail, normalizeEmail } from "@/lib/auth/email";
import { serverAuthClient } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask for a sign-in code. Only people on the invite list are emailed. The answer is the same either way, so nobody can
 * use this form to find out who is invited. (The database also refuses uninvited sign-ups on its own.)
 */
export async function POST(req: Request) {
  let body: { email?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  if (!isPlausibleEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!authConfigured()) return NextResponse.json({ error: "Accounts aren't set up on this deployment yet." }, { status: 503 });

  const same = NextResponse.json({ ok: true });
  try {
    const { data } = await db().from("invites").select("email").eq("email", email).maybeSingle();
    if (!data) { await sleep(300 + Math.random() * 300); return same; } // not invited: say nothing different, send nothing
    const supabase = serverAuthClient();
    if (!supabase) return same;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) console.error("sign-in code not sent:", error.message); // never log the address
  } catch (e) {
    console.error("sign-in code failed:", (e as Error).message);
  }
  return same;
}
