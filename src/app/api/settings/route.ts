import { NextResponse } from "next/server";
import { NotConfigured, dbConfigured, getSettings, putSettings } from "@/lib/db";
import { PRESETS } from "@/lib/presets";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ configured: false, hiddenPresets: [] });
  try {
    return NextResponse.json({ configured: true, ...(await getSettings()) });
  } catch (e) {
    return NextResponse.json({ configured: true, hiddenPresets: [], error: (e as Error).message }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  let body: { hiddenPresets?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!Array.isArray(body.hiddenPresets)) return NextResponse.json({ error: "hiddenPresets must be an array" }, { status: 400 });
  // Only real starter-ride ids are kept, so this can't be used to store arbitrary data.
  const known = new Set(PRESETS.map((p) => p.id));
  const hiddenPresets = [...new Set(body.hiddenPresets.filter((x): x is string => typeof x === "string" && known.has(x)))];
  try {
    return NextResponse.json({ configured: true, ...(await putSettings({ hiddenPresets })) });
  } catch (e) {
    if (e instanceof NotConfigured) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
