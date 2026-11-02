import type { Segment, Track, Workout } from "@/lib/types";
import { fmtClock, fmtTarget, wasLine } from "@/lib/format";
import { HandIcon, NoteIcon } from "./Icons";
import type { Step } from "@/lib/pacing";

export interface RideView {
  workout: Workout;
  index: number; // current block (segment)
  segElapsed: number; // seconds into the current block
  step: Step; // what to do right now (a minute of a sprint or climb, or a whole steady block)
  prevStep?: Step;
  nextStep?: Step;
  elapsed: number; // seconds into the ride
  total: number;
  tapIn: number; // seconds until next tap prompt
  now?: Track;
  next?: Track;
}

const TYPE_LABEL: Record<Segment["type"], string> = {
  warmup: "WARM-UP", flat: "FLAT", climb: "CLIMB", sprint: "SPRINT", recover: "RECOVER", cooldown: "COOL-DOWN",
};

/** Screen 1: ride, steady state. */
export default function RideScreen({ v }: { v: RideView }) {
  const { workout, index, segElapsed, step, prevStep, nextStep, elapsed, total, tapIn, now, next } = v;
  const segs = workout.segments;
  const seg = segs[index];
  const stepLeft = step.startSec + step.durationSec - elapsed;
  const playlist = workout.playlistUrl;

  return (
    <div className="flex h-full w-full flex-col gap-6 bg-ground text-ink" style={{ padding: "36px 56px 40px", boxSizing: "border-box" }}>
      {/* top row */}
      <div className="flex items-end justify-between">
        <div className="flex w-[280px] flex-col gap-2">
          <span className="text-[13px] font-medium uppercase tracking-[.18em] text-mist">Elapsed</span>
          <span className="num text-[52px] font-light" style={{ letterSpacing: "-.01em" }}>{fmtClock(elapsed)}</span>
        </div>
        <div className="flex flex-col items-center gap-[6px]">
          <span className="text-[14px] font-medium uppercase tracking-[.18em] text-ice">{TYPE_LABEL[step.type]} · SEGMENT {index + 1} OF {segs.length}{step.tag ? ` · ${step.tag}` : ""}</span>
          <span className="num text-[88px] font-extralight" style={{ letterSpacing: "-.02em" }}>{fmtClock(Math.ceil(stepLeft))}</span>
        </div>
        <div className="flex w-[280px] flex-col items-end gap-2">
          <span className="text-[13px] font-medium uppercase tracking-[.18em] text-mist">Remaining</span>
          <span className="num text-[52px] font-light" style={{ letterSpacing: "-.01em" }}>{fmtClock(Math.ceil(total - elapsed))}</span>
        </div>
      </div>

      {/* timeline */}
      <div className="flex h-7 gap-[6px]" aria-label="Ride timeline">
        {segs.map((s, i) => {
          const style = { flex: `${s.durationSec} 1 0` };
          if (i < index) return <div key={i} className="rounded-[6px] bg-line" style={style} />;
          if (i === index)
            return (
              <div key={i} className="box-border overflow-hidden rounded-[6px] border-2 border-ice bg-tile" style={style}>
                <div className="h-full bg-ice" style={{ width: `${Math.min(100, (segElapsed / seg.durationSec) * 100)}%` }} />
              </div>
            );
          return <div key={i} className="box-border rounded-[6px] border-2 border-line bg-tile" style={style} />;
        })}
      </div>

      {/* targets */}
      <div className="flex min-h-0 flex-1 gap-6">
        <Tile label="Cadence" unit="RPM" color="#C4DFE6" value={fmtTarget(step.cadence)} foot={wasLine(prevStep?.cadence, step.cadence, !prevStep)} />
        <Tile label="Resistance" unit="0–100" color="#66A5AD" value={fmtTarget(step.resistance)} foot={wasLine(prevStep?.resistance, step.resistance, !prevStep)} />
      </div>

      {/* cue row */}
      <div className="flex h-11 items-center justify-between">
        <span className="text-[24px] font-light" style={{ letterSpacing: ".005em" }}>{step.cue}</span>
        <span className="flex items-center gap-[10px] rounded-[22px] border-2 border-line px-[18px] py-[9px] text-[14px] font-normal tracking-[.04em] text-mist">
          <HandIcon color="#66A5AD" />
          Screen tap in {fmtClock(tapIn)}
        </span>
      </div>

      {/* bottom cards */}
      <div className="flex h-32 gap-6">
        <div className="flex flex-[1.3] flex-col justify-center gap-[10px] rounded-[20px] bg-tile px-8 py-5">
          <span className="text-[13px] font-medium uppercase tracking-[.18em] text-mist">
            {nextStep ? `Next up · in ${fmtClock(Math.ceil(stepLeft))}` : "Last segment"}
          </span>
          <span className="text-[22px] font-light leading-[1.2]" style={{ letterSpacing: ".01em" }}>
            {nextStep ? (
              <>
                {nextStep.name.toUpperCase()} · {fmtClock(nextStep.durationSec)}{" "}
                <span className="text-ice">{fmtTarget(nextStep.cadence)} RPM</span>{" "}
                <span className="text-mist">{fmtTarget(nextStep.resistance)}</span>
              </>
            ) : (
              "Finish strong"
            )}
          </span>
        </div>
        <div className="flex flex-[1.5] items-center gap-6 rounded-[20px] bg-tile px-8 py-5">
          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <span className="text-[13px] font-medium uppercase tracking-[.18em] text-mist">Music · {TYPE_LABEL[seg.type]}</span>
            <span className="truncate text-[19px] font-normal leading-tight">{now ? `Now: ${now.title} · ${now.artist}` : "No tracklist yet"}</span>
            {next && <span className="truncate text-[15px] font-light leading-tight text-mist">Next: {next.title} · {next.artist}</span>}
          </div>
          <a
            href={playlist || undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!playlist}
            className="flex h-[60px] items-center gap-3 rounded-[30px] bg-ice px-[26px] text-[16px] font-medium text-ground"
            style={{ letterSpacing: ".02em", opacity: playlist ? 1 : 0.4, pointerEvents: playlist ? "auto" : "none" }}
          >
            <NoteIcon color="#002A33" />
            Open playlist
          </a>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, unit, color, value, foot }: { label: string; unit: string; color: string; value: string; foot: string }) {
  return (
    <div className="flex flex-1 flex-col justify-between rounded-[28px] border-2 border-line bg-tile" style={{ padding: "28px 36px" }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-medium uppercase tracking-[.2em]" style={{ color }}>{label}</span>
        <span className="text-[15px] font-normal tracking-[.1em] text-mist">{unit}</span>
      </div>
      <span className="num text-[140px] font-light" style={{ color }}>{value}</span>
      <span className="text-[17px] font-light text-mist" style={{ letterSpacing: ".02em" }}>{foot}</span>
    </div>
  );
}
