import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import { dbConfigured, failResponse, getSettings, putSettings, requester } from "@/lib/db";
import { PRESETS } from "@/lib/presets";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!dbConfigured() && !authConfigured()) return NextResponse.json({ configured: false, hiddenPresets: [] });
  try {
    const { client } = await requester();
    return NextResponse.json({ configured: true, ...(await getSettings(client)) });
  } catch (e) { return failResponse(e, { configured: true, hiddenPresets: [] }); }
}

export async function PUT(req: Request) {
  let body: { hiddenPresets?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!Array.isArray(body.hiddenPresets)) return NextResponse.json({ error: "hiddenPresets must be an array" }, { status: 400 });
  // Only real starter-ride ids are kept, so this can't be used to store arbitrary data.
  const known = new Set(PRESETS.map((p) => p.id));
  const hiddenPresets = [...new Set(body.hiddenPresets.filter((x): x is string => typeof x === "string" && known.has(x)))];
  try { const { client, accounts } = await requester(); return NextResponse.json({ configured: true, ...(await putSettings({ hiddenPresets }, client, accounts)) }); } catch (e) { return failResponse(e); }
}
