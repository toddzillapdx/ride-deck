import { NextResponse } from "next/server";
import { deleteLog, failResponse, requester, updateLog } from "@/lib/db";
import { parseLogPatch } from "@/lib/history";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

/** Rows carried over from before the move to Supabase keep their old record id (rec...); new rows have a UUID. */
const RECORD_ID = /^(rec[A-Za-z0-9]{14}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export async function PATCH(req: Request, { params }: Ctx) {
  if (!RECORD_ID.test(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  let patch;
  try { patch = parseLogPatch(await req.json()); }
  catch (e) { return NextResponse.json({ error: e instanceof SyntaxError ? "Body must be JSON" : (e as Error).message }, { status: 400 }); }
  try { const { client } = await requester(); return NextResponse.json(await updateLog(params.id, patch, client)); } catch (e) { return failResponse(e); }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!RECORD_ID.test(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try { const { client } = await requester(); await deleteLog(params.id, client); return NextResponse.json({ ok: true }); } catch (e) { return failResponse(e); }
}
