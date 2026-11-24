"use client";
import { useState } from "react";

/** Paste the playlist agent's reply; the lengths in it replace the catalog lengths. Stays open and says why when nothing could be read. */
export default function ReportDialog({ onApply, onClose }: { onApply: (text: string) => string | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60" role="dialog" aria-label="Apply playlist lengths">
      <div className="flex w-[640px] max-w-[92%] flex-col gap-3 rounded-[22px] border-2 border-line bg-ground p-6">
        <span className="text-[22px] font-light">Apply playlist lengths</span>
        <span className="text-[14px] font-light text-mist">Paste the reply from the playlist agent. Each song&apos;s length on the music service replaces the catalog length, and the ride is re-fitted.</span>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} autoFocus rows={8} aria-label="Agent reply"
          placeholder={"Warren G - Regulate: 4:11 (target 3:46)\nSnoop Dogg - Gin and Juice: 3:32 (target 3:30)"}
          className="w-full resize-none rounded-[12px] border-2 border-line bg-tile p-3 text-[14px] text-ink outline-none focus:border-ice" />
        {err && <p className="m-0 text-[14px] text-ice">{err}</p>}
        <div className="flex items-center gap-3">
          <button onClick={() => setErr(onApply(text))} disabled={!text.trim()} className="h-11 rounded-full bg-ice px-6 text-[14px] font-medium text-ground disabled:opacity-40">Apply lengths</button>
          <button onClick={onClose} className="ml-auto h-11 rounded-full border-2 border-line px-6 text-[14px] text-ink">Cancel</button>
        </div>
      </div>
    </div>
  );
}
