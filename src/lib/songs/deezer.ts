import type { Candidate, SongQuery } from "./match";

/** Server-side only. Deezer's public search needs no key. Metadata only: no audio is ever fetched. */
const API = "https://api.deezer.com/search";

interface DzTrack {
  id: number; title: string; duration: number; rank: number; isrc?: string;
  artist?: { name?: string }; album?: { title?: string };
}

export function mapTracks(body: unknown): Candidate[] {
  const data = (body as { data?: DzTrack[] })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((t) => t && typeof t.title === "string" && typeof t.duration === "number" && t.duration > 0)
    .map((t) => ({
      id: String(t.id), title: t.title, artist: t.artist?.name ?? "", album: t.album?.title ?? "",
      durationSec: Math.round(t.duration), rank: typeof t.rank === "number" ? t.rank : 0, ...(t.isrc ? { isrc: t.isrc } : {}),
    }));
}

export async function searchDeezer(q: SongQuery, fetcher: typeof fetch = fetch): Promise<Candidate[]> {
  const url = `${API}?${new URLSearchParams({ q: `${q.artist} ${q.title}`, limit: "15" })}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Deezer ${res.status}`);
    const body = await res.json();
    // Deezer answers 200 with an error body when you go over its rate limit (about 50 calls per 5 seconds).
    if ((body as { error?: { code?: number } })?.error) {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      throw new Error("Deezer is busy. Try again in a moment.");
    }
    return mapTracks(body);
  }
  return [];
}
