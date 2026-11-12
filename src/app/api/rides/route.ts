import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import { createRide, createRideV2, dbConfigured, failResponse, listRides, requester } from "@/lib/db";
import { parseRideV2 } from "@/lib/engine";
import { parseWorkout } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** GET: the signed-in person's saved rides. Presets ship with the client, so they are not returned here. */
export async function GET() {
  if (!dbConfigured() && !authConfigured()) return NextResponse.json({ configured: false, rides: [] });
  try {
    const { client } = await requester();
    const { rides, skipped } = await listRides(client);
    return NextResponse.json({ configured: true, rides, skipped });
  } catch (e) {
    return failResponse(e, { configured: true, rides: [] });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  // A v2 ride (the new builder) is stored as v2; anything else is the old v1 shape.
  const v2 = (body as { schemaVersion?: unknown } | null)?.schemaVersion === 2;
  let ride, workout;
  try { if (v2) ride = parseRideV2(body); else workout = parseWorkout(body); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  try {
    const { client } = await requester();
    return NextResponse.json(ride ? await createRideV2(ride, client) : await createRide(workout!, client), { status: 201 });
  } catch (e) { return failResponse(e); }
}
