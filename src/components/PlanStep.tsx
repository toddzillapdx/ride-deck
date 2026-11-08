"use client";
import { useMemo } from "react";
import { fmtClock } from "@/lib/format";
import { repeatSegment, suggestAll, type FitOutcome, type RideDraft, type SegDraft } from "@/lib/builderV2";
import { segmentDuration } from "@/lib/engine";
import { segFromDraft } from "@/lib/builderV2";
import type { Check } from "@/lib/songFlow";
import SegmentCard from "./SegmentCard";
import { pill } from "./builderUi";

/** Step 2: a segment for each song. Lengths are derived and read-only. */
export default function PlanStep({ d, setD, fitted, check }: { d: RideDraft; setD: (d: RideDraft) => void; fitted: FitOutcome | null; check: Check }) {
  const setSeg = (i: number, patch: Partial<SegDraft>) => setD({ ...d, segments: d.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const shown = fitted && !fitted.errors.length ? fitted.draft : d;
  const lens = useMemo(() => shown.segments.map((s) => { try { return segmentDuration(segFromDraft(s)); } catch { return undefined; } }), [shown]);
  const starts = useMemo(() => { let t = 0; return lens.map((l) => { const at = t; t += l ?? 0; return at; }); }, [lens]);

  if (!d.songs.length) return <div className="rounded-[20px] border-2 border-dashed border-line p-10 text-center text-[18px] text-mist">Choose the music first, then plan the ride.</div>;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-none flex-wrap items-center gap-3">
        <span className="text-[14px] font-light text-mist">Each song is one segment, and the song decides its length. The first song is the warm-up. The last song starts the 2:00 cool-down. Pick Flat, Hill or Interval for the rest.</span>
        <button onClick={() => setD(suggestAll(d))} className={`${pill} ml-auto`}>Re-suggest from the music</button>
      </div>
      {fitted && fitted.errors.length > 0 && <p className="m-0 text-[14px] text-ice">{fitted.errors[0]}</p>}
      {fitted?.warnings.map((w, i) => <p key={i} className="m-0 text-[14px] text-ice">⚠ {w.message}</p>)}
      {check.state === "short" && <p className="m-0 text-[14px] text-ice">The ride is {fmtClock(check.deltaSec)} short of the target. Go back to Music and run Auto-adjust.</p>}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
        {shown.segments.map((s, i) => (
          <SegmentCard key={s.key} s={s} i={i} song={d.songs[i]} startSec={starts[i]} lenSec={lens[i]}
            end={i === 0 ? "first" : i === d.segments.length - 1 ? "last" : undefined}
            on={(p) => setSeg(i, p)} repeat={i > 1 ? () => setD(repeatSegment(d, i - 1, i)) : undefined} />
        ))}
      </div>
    </div>
  );
}
