import { NextResponse } from "next/server";
import { deleteRide, failResponse, getCuratedRaw, getCuratedWorkout, getRide, getRideRaw, getSettings, isAdmin, isCuratedId, isV2, patchRideMeta, requireAdmin, requester, updateRide, updateRideV2 } from "@/lib/db";
import { parseRideV2 } from "@/lib/engine";
import { getPreset, isPresetId } from "@/lib/presets";
import { parseWorkout } from "@/lib/validate";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

const PUBLISHED_READONLY = () => NextResponse.json({ error: "Published rides are managed under Admin, not here." }, { status: 403 });

export async function GET(req: Request, { params }: Ctx) {
  // A published ride: visible to any signed-in rider (the database hides drafts from them). Carries the link for their service.
  if (isCuratedId(params.id)) {
    try {
      const me = await requester();
      const { service } = await getSettings(me.client);
      const draftOk = await isAdmin(me); // the admin can ride a draft to test it; riders only ever get published rides
      if (new URL(req.url).searchParams.get("format") === "raw") return NextResponse.json(await getCuratedRaw(params.id, service, me.client, draftOk));
      return NextResponse.json(await getCuratedWorkout(params.id, service, me.client, draftOk));
    } catch (e) { return failResponse(e); }
  }
  // ?format=raw: the stored JSON untouched (v1 or v2). The ride screen converts v1 itself.
  if (isPresetId(params.id)) {
    try { await requester(); } catch (e) { return failResponse(e); } // the starter rides are for signed-in people too
    const p = getPreset(params.id);
    return p ? NextResponse.json(p) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const { client } = await requester();
    if (new URL(req.url).searchParams.get("format") === "raw") return NextResponse.json(await getRideRaw(params.id, client));
    return NextResponse.json(await getRide(params.id, client));
  } catch (e) { return failResponse(e); }
}

export async function PUT(req: Request, { params }: Ctx) {
  if (isCuratedId(params.id)) return PUBLISHED_READONLY();
  if (isPresetId(params.id)) return NextResponse.json({ error: "Presets are read-only. Duplicate it first." }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  const v2 = (body as { schemaVersion?: unknown } | null)?.schemaVersion === 2;
  let ride, workout;
  try { if (v2) ride = parseRideV2(body); else workout = parseWorkout(body); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  try {
    const { client } = await requireAdmin();
    if (ride) return NextResponse.json(await updateRideV2(params.id, ride, client));
    // The old builder only understands v1. Saving would flatten a v2 ride's intervals and effort, so refuse.
    if (await isV2(params.id, client)) return NextResponse.json({ error: "This ride uses the new format. The builder is being rebuilt, so it can't be edited here yet." }, { status: 409 });
    return NextResponse.json(await updateRide(params.id, workout!, client));
  } catch (e) { return failResponse(e); }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (isCuratedId(params.id)) return PUBLISHED_READONLY();
  if (isPresetId(params.id)) return NextResponse.json({ error: "Presets can't be deleted" }, { status: 403 });
  try { const { client } = await requireAdmin(); await deleteRide(params.id, client); return NextResponse.json({ ok: true }); } catch (e) { return failResponse(e); }
}

/** PATCH: music-planner changes (tracklist, playlist link, style). Leaves the segments alone. A stored v1 ride is converted in place. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (isCuratedId(params.id)) return PUBLISHED_READONLY();
  if (isPresetId(params.id)) return NextResponse.json({ error: "Presets are read-only. Save a copy first." }, { status: 403 });
  let meta;
  try { meta = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  try { const { client } = await requireAdmin(); return NextResponse.json(await patchRideMeta(params.id, meta, client)); } catch (e) { return failResponse(e); }
}
