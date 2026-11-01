import { NextResponse } from "next/server";
import { AirtableNotConfigured, airtableConfigured, createLog, listLogs } from "@/lib/airtable";
import { parseLogInput } from "@/lib/history";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!airtableConfigured()) return NextResponse.json({ configured: false, logs: [] });
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
    if (e instanceof AirtableNotConfigured) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
