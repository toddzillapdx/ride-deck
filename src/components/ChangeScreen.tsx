import type { Target } from "@/lib/types";
import type { Step } from "@/lib/pacing";
import { direction, fmtClock, fmtTarget } from "@/lib/format";

interface Props {
  index: number;
  count: number;
  seg: Step; // the step that is ending
  next: Step; // the step starting next
  secondsLeft: number;
  elapsed: number;
  total: number;
}

const CADENCE_WORD = { up: "FASTER ↑", down: "SLOWER ↓", same: "SAME" } as const;
const RESIST_WORD = { up: "HEAVIER ↑", down: "LIGHTER ↓", same: "SAME" } as const;

/** Screen 2: last 10 seconds of a segment. Whole screen flips to ice. */
export default function ChangeScreen({ index, count, seg, next, secondsLeft, elapsed, total }: Props) {
  return (
    <div className="flex h-full w-full flex-col gap-6 bg-ice text-ground" style={{ padding: "36px 56px 40px", boxSizing: "border-box" }}>
      <div className="flex items-center justify-between text-[14px] font-medium uppercase tracking-[.18em]">
        <span>Elapsed {fmtClock(elapsed)} · Remaining {fmtClock(Math.ceil(total - elapsed))}</span>
        <span>Segment {index + 1} of {count}{seg.tag ? ` · ${seg.tag}` : ""}</span>
      </div>

      <div className="flex flex-1 items-center justify-center" style={{ gap: 72 }}>
        <div className="flex flex-col gap-[6px]">
          <span className="text-[16px] font-medium uppercase tracking-[.24em]">Change in</span>
          <span className="num text-[300px] font-extralight" style={{ lineHeight: 0.9 }}>{Math.max(1, Math.ceil(secondsLeft))}</span>
        </div>
        <div className="flex flex-col gap-[6px]">
          <span className="text-[16px] font-medium uppercase tracking-[.24em]">Next</span>
          <span className="text-[150px] font-extralight uppercase leading-none" style={{ letterSpacing: "-.02em" }}>{next.name}</span>
          <span className="text-[22px] font-normal" style={{ letterSpacing: ".01em" }}>{fmtClock(next.durationSec)}{next.tag ? ` · ${next.tag}` : ""} · {next.cue}</span>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: 236 }}>
        <Card label="Cadence · RPM" color="#C4DFE6" word={CADENCE_WORD[direction(seg.cadence, next.cadence)]} value={next.cadence} from={seg.cadence} />
        <Card label="Resistance" color="#66A5AD" word={RESIST_WORD[direction(seg.resistance, next.resistance)]} value={next.resistance} from={seg.resistance} />
      </div>
    </div>
  );
}

function Card({ label, color, word, value, from }: { label: string; color: string; word: string; value: Target | undefined; from: Target | undefined }) {
  return (
    <div className="flex flex-1 flex-col justify-between rounded-[24px] bg-ground" style={{ padding: "28px 36px" }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-medium uppercase tracking-[.2em]" style={{ color }}>{label}</span>
        <span className="text-[15px] font-medium tracking-[.14em] text-ink">{word}</span>
      </div>
      <span className="num text-[84px] font-light" style={{ color }}>{fmtTarget(value)}</span>
      <span className="text-[17px] font-light text-mist" style={{ letterSpacing: ".02em" }}>{from === undefined ? "" : `from ${fmtTarget(from)}`}</span>
    </div>
  );
}
