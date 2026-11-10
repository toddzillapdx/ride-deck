import { NextResponse } from "next/server";
import { NotConfigured, NotFound, deleteLog, updateLog } from "@/lib/db";
import { parseLogPatch } from "@/lib/history";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

/** Old rows keep their Airtable record id (rec...); new rows have a UUID. */
const RECORD_ID = /^(rec[A-Za-z0-9]{14}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const fail = (e: unknown) =>
  e instanceof NotConfigured
    ? NextResponse.json({ error: e.message }, { status: 503 })
    : NextResponse.json({ error: (e as Error).message }, { status: e instanceof NotFound ? 404 : 502 });

export async function PATCH(req: Request, { params }: Ctx) {
  if (!RECORD_ID.test(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  let patch;
  try { patch = parseLogPatch(await req.json()); }
  catch (e) { return NextResponse.json({ error: e instanceof SyntaxError ? "Body must be JSON" : (e as Error).message }, { status: 400 }); }
  try { return NextResponse.json(await updateLog(params.id, patch)); } catch (e) { return fail(e); }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!RECORD_ID.test(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try { await deleteLog(params.id); return NextResponse.json({ ok: true }); } catch (e) { return fail(e); }
}
