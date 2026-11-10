import { NextResponse } from "next/server";
import { NotConfigured, createLog, dbConfigured, listLogs } from "@/lib/db";
import { parseLogInput } from "@/lib/history";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ configured: false, logs: [] });
  try {
    return NextResponse.json({ configured: true, logs: await listLogs() });
  } catch (e) {
    return NextResponse.json({ configured: true, logs: [], error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  let input;
  try { input = parseLogInput(await req.json()); }
  catch (e) { return NextResponse.json({ error: e instanceof SyntaxError ? "Body must be JSON" : (e as Error).message }, { status: 400 }); }
  try {
    return NextResponse.json(await createLog(input), { status: 201 });
  } catch (e) {
    if (e instanceof NotConfigured) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
