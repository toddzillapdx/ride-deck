"use client";
import { useState } from "react";
import { snapshotEffort, type SegSnapshot } from "@/lib/history";
import type { Target } from "@/lib/types";
import { fmtClock, fmtTarget } from "@/lib/format";

/**
 * Targets by segment, over ride time. Cadence and effort are different scales, so they get
 * separate panels, never one dual-axis chart. Cadence is always ice and effort always mist. Old rides' resistance is shown as effort.
 * Bars span each segment's min-max range; hover or tap a segment for its numbers.
 */
interface Props {
  segments: SegSnapshot[];
  /** Segments before this index were ridden; the rest are shown faded. Omit to show all. */
  reached?: number;
  panelHeight?: number;
  /** Phone: labels sit above each panel instead of in a side column. */
  compact?: boolean;
}

const range = (t: Target | undefined): [number, number] | null => (t === undefined ? null : Array.isArray(t) ? t : [t, t]);

function Panel({ title, unit, color, segs, pick, max, reached, height, active, setActive, compact }: {
  compact?: boolean; title: string; unit: string; color: string; segs: SegSnapshot[]; pick: (s: SegSnapshot) => Target | undefined;
  max: number; reached: number; height: number; active: number | null; setActive: (i: number | null) => void;
}) {
  return (
    <div className={compact ? "flex flex-col gap-1" : "flex gap-3"}>
      {compact ? (
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-2 text-[14px] font-medium uppercase tracking-[.14em] text-mist">
            <span aria-hidden className="inline-block h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />
            {title}
          </span>
          <span className="text-[14px] font-light text-mist">{max} {unit} max</span>
        </div>
      ) : (
        <div className="flex w-[148px] flex-none flex-col justify-between py-[2px]" style={{ height }}>
          <span className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-[.16em] text-mist">
            <span aria-hidden className="inline-block h-[10px] w-[10px] rounded-[3px]" style={{ background: color }} />
            {title}
          </span>
          <span className="text-[13px] font-light text-mist">{max} {unit} max</span>
        </div>
      )}
      <div className="relative flex min-w-0 flex-1 gap-[2px]" style={{ height }}>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: 1, background: "#07575B" }} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0" style={{ top: "50%", height: 1, background: "#07575B", opacity: 0.5 }} />
        {segs.map((s, i) => {
          const r = range(pick(s));
          const done = i < reached;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
              aria-label={`${s.name}, ${fmtClock(s.durationSec)}, ${title.toLowerCase()} ${fmtTarget(pick(s))}`}
              className="relative h-full rounded-[4px] outline-none"
              style={{ flex: `${s.durationSec} 1 0`, background: active === i ? "#003B46" : "transparent", minWidth: 0 }}
            >
              {r && (
                <span
                  className="absolute inset-x-0 mx-auto block rounded-[4px]"
                  style={{
                    width: "calc(100% - 2px)",
                    bottom: `${Math.min(100, (r[0] / max) * 100)}%`,
                    height: `max(6px, ${((r[1] - r[0]) / max) * 100}%)`,
                    background: color,
                    opacity: !done ? 0.3 : active === null || active === i ? 1 : 0.55,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TargetsChart({ segments, reached, panelHeight = 88, compact }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const total = segments.reduce((n, s) => n + s.durationSec, 0);
  const done = reached ?? segments.length;
  const cadHigh = Math.max(0, ...segments.map((s) => range(s.cadence)?.[1] ?? 0));
  const cadMax = Math.max(120, Math.ceil(cadHigh / 20) * 20);
  const a = active === null ? null : segments[active];

  return (
    <figure className="m-0 flex flex-col gap-2" aria-label="Target cadence and effort by segment">
      <div className={compact ? "min-h-[18px] text-[14px] font-normal text-ink" : "h-[22px] text-[14px] font-normal text-ink"} aria-live="polite">
        {a ? (
          <>
            {a.name} · {fmtClock(a.durationSec)} · <span className="text-mist">Cadence</span> {fmtTarget(a.cadence)} · <span className="text-mist">Effort</span> {fmtTarget(snapshotEffort(a))}
            {active! >= done && <span className="text-mist"> · not reached</span>}
          </>
        ) : (
          <span className="text-mist">Tap a segment to see its targets</span>
        )}
      </div>
      <Panel compact={compact} title="Cadence" unit="RPM" color="#C4DFE6" segs={segments} pick={(s) => s.cadence} max={cadMax} reached={done} height={panelHeight} active={active} setActive={setActive} />
      <Panel compact={compact} title="Effort" unit="" color="#66A5AD" segs={segments} pick={snapshotEffort} max={10} reached={done} height={panelHeight} active={active} setActive={setActive} />
      <div className="flex gap-3">
        {!compact && <div className="w-[148px] flex-none" />}
        <div className="flex flex-1 justify-between text-[13px] font-light text-mist">
          <span>0:00</span><span>{fmtClock(total / 2)}</span><span>{fmtClock(total)}</span>
        </div>
      </div>
      <table className="sr-only">
        <caption>Targets by segment</caption>
        <thead><tr><th>Segment</th><th>Length</th><th>Cadence RPM</th><th>Effort</th></tr></thead>
        <tbody>{segments.map((s, i) => <tr key={i}><td>{s.name}</td><td>{fmtClock(s.durationSec)}</td><td>{fmtTarget(s.cadence)}</td><td>{fmtTarget(snapshotEffort(s))}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
