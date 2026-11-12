import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import { createLog, dbConfigured, failResponse, listLogs, requester } from "@/lib/db";
import { parseLogInput } from "@/lib/history";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!dbConfigured() && !authConfigured()) return NextResponse.json({ configured: false, logs: [] });
  try {
    const { client } = await requester();
    return NextResponse.json({ configured: true, logs: await listLogs(client) });
  } catch (e) { return failResponse(e, { configured: true, logs: [] }); }
}

export async function POST(req: Request) {
  let input;
  try { input = parseLogInput(await req.json()); }
  catch (e) { return NextResponse.json({ error: e instanceof SyntaxError ? "Body must be JSON" : (e as Error).message }, { status: 400 }); }
  try { const { client } = await requester(); return NextResponse.json(await createLog(input, client), { status: 201 }); } catch (e) { return failResponse(e); }
}
