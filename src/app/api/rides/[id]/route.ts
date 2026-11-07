import { NextResponse } from "next/server";
import { AirtableNotConfigured, deleteRide, getRide, getRideRaw, updateRide } from "@/lib/airtable";
import { getPreset, isPresetId } from "@/lib/presets";
import { parseWorkout } from "@/lib/validate";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

const fail = (e: unknown) =>
  e instanceof AirtableNotConfigured
    ? NextResponse.json({ error: e.message }, { status: 503 })
    : NextResponse.json({ error: (e as Error).message }, { status: /Airtable 404/.test((e as Error).message) ? 404 : 502 });

export async function GET(req: Request, { params }: Ctx) {
  // ?format=raw: the stored JSON untouched (v1 or v2). The ride screen converts v1 itself.
  if (!isPresetId(params.id) && new URL(req.url).searchParams.get("format") === "raw") {
    try { return NextResponse.json(await getRideRaw(params.id)); } catch (e) { return fail(e); }
  }
  if (isPresetId(params.id)) {
    const p = getPreset(params.id);
    return p ? NextResponse.json(p) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try { return NextResponse.json(await getRide(params.id)); } catch (e) { return fail(e); }
}

export async function PUT(req: Request, { params }: Ctx) {
  if (isPresetId(params.id)) return NextResponse.json({ error: "Presets are read-only. Duplicate it first." }, { status: 403 });
  let workout;
  try { workout = parseWorkout(await req.json()); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  try { return NextResponse.json(await updateRide(params.id, workout)); } catch (e) { return fail(e); }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (isPresetId(params.id)) return NextResponse.json({ error: "Presets can't be deleted" }, { status: 403 });
  try { await deleteRide(params.id); return NextResponse.json({ ok: true }); } catch (e) { return fail(e); }
}
