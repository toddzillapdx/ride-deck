import { NextResponse } from "next/server";
import { failResponse, getSettings, listPublished, requester } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The published rides, for the library. Each carries the playlist link for this rider's music service (once they have chosen one). */
export async function GET() {
  try {
    const { client } = await requester();
    const { service } = await getSettings(client);
    return NextResponse.json({ rides: await listPublished(service, client), service });
  } catch (e) { return failResponse(e, { rides: [] }); }
}
