import { NextResponse } from "next/server";
import { db, failResponse, loadConsole, requireAdmin } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Admin: the whole console in one read: requests, invites waiting, riders, and recent activity. */
export async function GET() {
  try {
    const me = await requireAdmin();
    return NextResponse.json(await loadConsole({ email: me.email, userId: me.userId }, db()));
  } catch (e) { return failResponse(e); }
}
