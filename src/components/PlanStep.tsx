"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtClock } from "@/lib/format";
import { repeatSegment, segFromDraft, suggestAll, type FitOutcome, type RideDraft, type SegDraft } from "@/lib/builderV2";
import { segmentDuration, hillLevels, type RideSegment } from "@/lib/engine";
import type { Check } from "@/lib/songFlow";
import SegmentCard from "./SegmentCard";

/** A short phrase for the compact row. */
function summary(seg: RideSegment | null, s: SegDraft): string {
  if (!seg) return "";
  if (seg.type === "hill") return `Hill · effort ${seg.effortFrom} to ${seg.effortTo}`;
  if (seg.type === "interval") return `${seg.workKind === "sprint" ? "Sprint" : "Resistance"} ${seg.ratio} · ${seg.rounds} rounds`;
  return `${s.role === "warmup" ? "Warm-up" : s.role === "cooldown" ? "Cool-down" : s.role === "recover" ? "Recover" : "Steady"} · cadence ${s.cadMin}${s.cadMax ? `–${s.cadMax}` : ""}`;
}
const TINT: Record<string, string> = { flat: "#66A5AD", hill: "#C4DFE6", interval: "#C4DFE6" };

/** Step 2, all on one screen: every segment as one compact row on the left, the selected one's settings on the right. */
export default function PlanStep({ d, setD, fitted, check }: { d: RideDraft; setD: (d: RideDraft) => void; fitted: RideDraftFit; check: Check }) {
  const [sel, setSel] = useState(1);
  useEffect(() => { if (sel >= d.segments.length) setSel(Math.max(0, d.segments.length - 1)); }, [d.segments.length, sel]);
  const setSeg = (i: number, patch: Partial<SegDraft>) => setD({ ...d, segments: d.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const shown = fitted && !fitted.errors.length ? fitted.draft : d;
  const segs = useMemo(() => shown.segments.map((s) => { try { return segFromDraft(s); } catch { return null; } }), [shown]);
  const lens = useMemo(() => segs.map((x) => (x ? segmentDuration(x) : undefined)), [segs]);
  const starts = useMemo(() => { let t = 0; return lens.map((l) => { const at = t; t += l ?? 0; return at; }); }, [lens]);
  const n = d.segments.length;
  const cols = n <= 20 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const rowH = Math.max(30, Math.min(46, Math.floor(560 / rows) - 4));

  if (!n) return <div className="flex h-full items-center justify-center rounded-[20px] border-2 border-dashed border-line p-10 text-center text-[18px] text-mist">Choose the music first, then plan the ride.</div>;
  const s = d.segments[sel] ?? d.segments[0];
  const i = d.segments.indexOf(s);
  const warn = [...(fitted?.errors ?? []), ...(fitted?.warnings.map((x) => x.message) ?? [])];
  return (
    <div className="flex h-full min-h-0 gap-6">
      <div className="flex min-w-0 flex-[1.05] flex-col gap-2">
        <div className="flex flex-none items-center gap-3">
          <span className="text-[14px] font-light text-mist">Each song is a segment. Click one to set it up. Lengths come from the songs.</span>
          <span className="flex-1" />
          <button onClick={() => setD(suggestAll(d))} className="h-9 flex-none rounded-full border-2 border-line px-4 text-[14px] text-ink">Re-suggest all</button>
        </div>
        {warn.slice(0, 2).map((m, k) => <p key={k} className="m-0 flex-none text-[14px] text-ice">⚠ {m}</p>)}
        <div className="grid min-h-0 flex-1 content-start gap-x-3 gap-y-1" style={{ gridAutoFlow: "column", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, ${rowH}px)` }}>
          {shown.segments.map((seg, k) => {
            const on = k === i;
            return (
              <button key={seg.key} onClick={() => setSel(k)} aria-pressed={on}
                className={`flex items-center gap-3 rounded-[10px] border-2 px-3 text-left ${on ? "border-ice bg-tile" : "border-transparent bg-tile"}`} style={{ height: rowH }}>
                <span className="w-5 flex-none text-center text-[14px] text-mist">{k + 1}</span>
                <span className="h-3 w-3 flex-none rounded-full" style={{ background: TINT[seg.type] }} />
                <span className="min-w-0 flex-1 truncate text-[14px]">{d.songs[k]?.title}<span className="font-light text-mist"> · {summary(segs[k], seg)}</span></span>
                <span className="flex-none text-[14px] text-ink">{lens[k] !== undefined ? fmtClock(lens[k] as number) : "—"}</span>
                <span className="w-[54px] flex-none text-right text-[14px] font-light text-mist">{fmtClock(starts[k] ?? 0)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex min-h-0 w-[540px] flex-none flex-col">
        <SegmentCard s={shown.segments[i] ?? s} i={i} song={d.songs[i]} startSec={starts[i]} lenSec={lens[i]}
          end={i === 0 ? "first" : i === n - 1 ? "last" : undefined}
          on={(p) => setSeg(i, p)} repeat={i > 1 ? () => setD(repeatSegment(d, i - 1, i)) : undefined} />
        {check.state === "short" && <p className="m-0 mt-3 text-[14px] text-ice">The ride is {fmtClock(check.deltaSec)} short of the target. Go back and use Fix length.</p>}
      </div>
    </div>
  );
}
type RideDraftFit = FitOutcome | null;
void hillLevels;
