import { NextResponse } from "next/server";
import { createCuratedDraft, failResponse, getCuratedRaw, getCuratedSummary, getRideRaw, isCuratedId, listCurated, requireAdmin } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Admin: every curated ride (drafts and published) with its links and what is still missing. */
export async function GET() {
  try { const { client } = await requireAdmin(); return NextResponse.json({ rides: await listCurated(client) }); }
  catch (e) { return failResponse(e, { rides: [] }); }
}

/**
 * Admin: make a new draft curated ride from either one of your saved rides, { rideId }, or an existing curated ride, { copyOf }
 * (that is how a published ride gets a new version: its segments are locked, so you copy it and change the copy). The copy is a snapshot.
 */
export async function POST(req: Request) {
  let body: { rideId?: unknown; copyOf?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  const copyOf = typeof body.copyOf === "string" && isCuratedId(body.copyOf) ? body.copyOf : null;
  const rideId = typeof body.rideId === "string" && body.rideId && !isCuratedId(body.rideId) ? body.rideId : null;
  if (!copyOf && !rideId) return NextResponse.json({ error: "Send rideId (one of your saved rides) or copyOf (a published-ride id)" }, { status: 400 });
  try {
    const { client } = await requireAdmin();
    const raw = copyOf ? await getCuratedRaw(copyOf, null, client, true) : await getRideRaw(rideId!, client);
    if (copyOf) (raw as { name?: string }).name = `${String(raw.name ?? "Ride")} (new version)`;
    const links = copyOf ? (await getCuratedSummary(copyOf, client)).links : {};
    return NextResponse.json(await createCuratedDraft(raw, client, links), { status: 201 });
  } catch (e) { return failResponse(e); }
}
