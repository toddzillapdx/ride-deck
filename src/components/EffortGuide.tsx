"use client";
import { EFFORT_GUIDE } from "@/lib/engine";

/** The 1-10 effort scale, by feel. Opened from the start screen and from the "?" on the effort tile. */
export default function EffortGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ground/95 p-4" role="dialog" aria-label="Effort guide" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-[640px] flex-col gap-3 overflow-y-auto rounded-[24px] border-2 border-line bg-tile p-5 text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-medium uppercase tracking-[.2em] text-ice">Effort · 1 to 10</span>
        </div>
        <p className="m-0 text-[16px] font-light text-mist">Judge it by feel. Cadence tells you the speed; effort tells you how hard that speed should feel.</p>
        <div className="flex flex-col">
          {EFFORT_GUIDE.map((g) => (
            <div key={g.word} className="flex items-center gap-4 border-t border-line py-3">
              <span className="num w-[56px] flex-none text-[28px] font-light text-ice">{g.from === g.to ? g.from : `${g.from}–${g.to}`}</span>
              <div className="flex min-w-0 flex-col">
                <span className="text-[18px] font-medium">{g.word}</span>
                <span className="text-[16px] font-light text-mist">{g.talk}</span>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="h-[56px] rounded-full bg-ice text-[16px] font-medium uppercase tracking-[.08em] text-ground">Close</button>
      </div>
    </div>
  );
}
