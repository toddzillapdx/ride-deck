import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import { dbConfigured, failResponse, getSettings, putSettings, requester } from "@/lib/db";
import { PRESETS } from "@/lib/presets";
import { isActiveService } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!dbConfigured() && !authConfigured()) return NextResponse.json({ configured: false, hiddenPresets: [] });
  try {
    const { client } = await requester();
    return NextResponse.json({ configured: true, ...(await getSettings(client)) });
  } catch (e) { return failResponse(e, { configured: true, hiddenPresets: [] }); }
}

/** Saves what is sent and keeps the rest: { hiddenPresets? } and/or { service? } (the rider's music service, or null to clear it). */
export async function PUT(req: Request) {
  let body: { hiddenPresets?: unknown; service?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  const hasHidden = body.hiddenPresets !== undefined, hasService = body.service !== undefined;
  if (!hasHidden && !hasService) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  if (hasHidden && !Array.isArray(body.hiddenPresets)) return NextResponse.json({ error: "hiddenPresets must be an array" }, { status: 400 });
  if (hasService && body.service !== null && !isActiveService(body.service)) return NextResponse.json({ error: "service must be spotify or amazon" }, { status: 400 });
  try {
    const { client, accounts } = await requester();
    const current = await getSettings(client);
    const next = { ...current };
    if (hasHidden) {
      // Only real starter-ride ids are kept, so this can't be used to store arbitrary data.
      const known = new Set(PRESETS.map((p) => p.id));
      next.hiddenPresets = [...new Set((body.hiddenPresets as unknown[]).filter((x): x is string => typeof x === "string" && known.has(x)))];
    }
    if (hasService) next.service = body.service as typeof next.service;
    return NextResponse.json({ configured: true, ...(await putSettings(next, client, accounts)) });
  } catch (e) { return failResponse(e); }
}
