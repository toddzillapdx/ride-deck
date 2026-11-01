import { NextResponse } from "next/server";
import { AirtableNotConfigured, airtableConfigured, createRide, listRides } from "@/lib/airtable";
import { parseWorkout } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** GET: saved rides from Airtable. Presets ship with the client, so they are not returned here. */
export async function GET() {
  if (!airtableConfigured()) return NextResponse.json({ configured: false, rides: [] });
  try {
    const { rides, skipped } = await listRides();
    return NextResponse.json({ configured: true, rides, skipped });
  } catch (e) {
    return NextResponse.json({ configured: true, rides: [], error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  let workout;
  try { workout = parseWorkout(body); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  try {
    return NextResponse.json(await createRide(workout), { status: 201 });
  } catch (e) {
    if (e instanceof AirtableNotConfigured) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
