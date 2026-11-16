import { NextResponse } from "next/server";
import { db, failResponse, parseAction, performAction, requireAdmin } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Admin: one action on the invite list or a rider: add or approve an invite, decline, exempt from limits, remove, send the invitation email,
 * disable or enable a rider. Body: { action, ... }. Answers { message, email? }.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  try {
    const me = await requireAdmin();
    const action = parseAction(body);
    return NextResponse.json(await performAction(action, { email: me.email ?? "admin", userId: me.userId }, db()));
  } catch (e) { return failResponse(e); }
}
