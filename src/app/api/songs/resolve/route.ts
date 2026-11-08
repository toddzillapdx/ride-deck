import { NextResponse } from "next/server";
import { rememberSong, resolveSongs } from "@/lib/songs/resolve";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** POST { songs: [{artist,title}] } looks songs up. POST { remember: {artist,title,durationSec,candidate?} } saves a pick or a typed length. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 60_000) return bad("Request too large", 413);
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw); } catch { return bad("Body must be JSON"); }

  if (b.remember && typeof b.remember === "object") {
    const r = b.remember as Record<string, unknown>;
    const artist = text(r.artist, 120), title = text(r.title, 120), sec = Number(r.durationSec);
    if (!artist || !title || !Number.isFinite(sec) || sec < 20 || sec > 1800) return bad("A song and a length from 0:20 to 30:00 are needed.");
    const c = r.candidate as Record<string, unknown> | undefined;
    const candidate = c && typeof c.id === "string"
      ? { id: text(c.id, 40), title: text(c.title, 160), artist: text(c.artist, 120), album: text(c.album, 160), durationSec: Math.round(sec), rank: 0, ...(typeof c.isrc === "string" ? { isrc: text(c.isrc, 20) } : {}) }
      : undefined;
    const saved = await rememberSong({ artist, title }, { durationSec: sec, candidate });
    return NextResponse.json({ saved });
  }

  if (!Array.isArray(b.songs) || !b.songs.length) return bad("songs must be a list");
  const songs = (b.songs as Record<string, unknown>[]).slice(0, 40).map((s) => ({ artist: text(s?.artist, 120), title: text(s?.title, 120) })).filter((s) => s.artist && s.title);
  if (!songs.length) return bad("Each song needs an artist and a title.");
  return NextResponse.json({ songs: await resolveSongs(songs) });
}
