"use client";
import { useState } from "react";
import { fmtClock } from "@/lib/format";
import type { SongCandidate, SongDraft } from "@/lib/builderV2";

const parseLen = (t: string): number | null => {
  const m = t.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d+$/.test(t.trim()) && Number(t) >= 20 && Number(t) <= 1800 ? Number(t) : null;
};

/** The one place a song's length is confirmed: pick a catalog version, or type the length. Opens only when asked. */
export default function VersionPicker({ song, onPick, onType, onClose }: { song: SongDraft; onPick: (c: SongCandidate) => void; onType: (sec: number) => void; onClose: () => void }) {
  const [text, setText] = useState(song.durationSec && song.status !== "doubtful" ? fmtClock(song.durationSec) : "");
  const n = parseLen(text);
  const list = song.candidates ?? [];
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60" role="dialog" aria-label="Choose the version">
      <div className="flex w-[640px] max-w-[92%] flex-col gap-4 rounded-[22px] border-2 border-line bg-ground p-6">
        <div className="flex flex-col gap-1">
          <span className="text-[22px] font-light">{song.title}</span>
          <span className="text-[14px] font-light text-mist">{song.artist}</span>
          <span className="text-[14px] text-ice">{song.note || (list.length ? "More than one version exists. Pick the one on your playlist." : "Not found in the catalog. Type the length.")}</span>
        </div>
        {list.length > 0 && (
          <div className="flex flex-col gap-2">
            {list.map((c) => (
              <button key={c.id} onClick={() => onPick(c)} className="flex h-12 items-center gap-4 rounded-[14px] border-2 border-line bg-tile px-4 text-left hover:border-ice">
                <span className="w-[64px] text-[18px]">{fmtClock(c.durationSec)}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-light text-mist">{c.title} · {c.album || "single"}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="m:ss" inputMode="numeric" aria-label="Type the length" autoFocus={!list.length}
            onKeyDown={(e) => { if (e.key === "Enter" && n) onType(n); }}
            className="h-11 w-[110px] rounded-[12px] border-2 border-line bg-tile px-3 text-center text-[16px] text-ink outline-none focus:border-ice" />
          <button onClick={() => n && onType(n)} disabled={!n} className="h-11 rounded-full bg-ice px-6 text-[14px] font-medium text-ground disabled:opacity-40">Use this length</button>
          <button onClick={onClose} className="ml-auto h-11 rounded-full border-2 border-line px-6 text-[14px] text-ink">Cancel</button>
        </div>
      </div>
    </div>
  );
}
