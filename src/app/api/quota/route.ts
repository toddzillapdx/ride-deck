import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import { failResponse, requester } from "@/lib/db";
import { PLAN_LIMIT, SWAP_LIMIT } from "@/lib/quota";

export const dynamic = "force-dynamic";

/** What is left of this week's song planning, for the "3 plans left this week" line. Does not use one. */
export async function GET() {
  if (!authConfigured()) return NextResponse.json({ enabled: false });
  try {
    const { client } = await requester();
    const [plan, swap] = await Promise.all([
      client.rpc("quota_status", { p_kind: "plan", p_limit: PLAN_LIMIT() }),
      client.rpc("quota_status", { p_kind: "swap", p_limit: SWAP_LIMIT() }),
    ]);
    if (plan.error || swap.error) return NextResponse.json({ enabled: true, error: "Couldn't read your weekly limit." }, { status: 502 });
    return NextResponse.json({ enabled: true, plan: plan.data, swap: swap.data });
  } catch (e) { return failResponse(e, { enabled: true }); }
}
