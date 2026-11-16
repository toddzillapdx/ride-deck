import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import { failResponse, getSettings, requester } from "@/lib/db";

export const dynamic = "force-dynamic";

const KINDS = ["opened", "playlist_opened", "started", "finished"] as const;

/**
 * A rider did something with a ride: opened it, tapped Open playlist, started it, finished it. Ids, the rider's music service and a
 * time are recorded, nothing else. It never blocks the ride: the app sends it without waiting, and a failure is ignored there.
 */
export async function POST(req: Request) {
  if (!authConfigured()) return NextResponse.json({ ok: true, recorded: false });
  let body: { rideId?: unknown; kind?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  const { rideId, kind } = body;
  if (typeof rideId !== "string" || rideId.length < 1 || rideId.length > 80) return NextResponse.json({ error: "rideId is required" }, { status: 400 });
  if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  try {
    const { client } = await requester();
    const { service } = await getSettings(client);
    const { error } = await client.from("ride_events").insert({ ride_id: rideId, kind, service });
    if (error) return NextResponse.json({ error: "Couldn't record that" }, { status: 502 });
    return NextResponse.json({ ok: true, recorded: true });
  } catch (e) { return failResponse(e); }
}
