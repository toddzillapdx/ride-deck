import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import { failResponse, isAdmin, requester } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Who is asking: lets the screens hide controls that are not for them. The server still checks every action itself. */
export async function GET() {
  if (!authConfigured()) return NextResponse.json({ accounts: false, signedIn: true, admin: true });
  try {
    const me = await requester();
    return NextResponse.json({ accounts: true, signedIn: true, email: me.email, admin: await isAdmin(me) });
  } catch (e) { return failResponse(e); }
}
