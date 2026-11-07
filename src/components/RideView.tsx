import type { CSSProperties, ReactNode } from "react";
import { direction, fmtClock, fmtTarget, wasLine } from "@/lib/format";
import { effortWord, type Phase, type Ride, type RideSegment, type RideTrack } from "@/lib/engine";
import { HandIcon, NoteIcon } from "./Icons";
import { PauseIcon } from "./RideControls";

/**
 * The one ride screen. Responsive: portrait stacks the tiles (iPhone first), landscape puts them side
 * by side, and sizes grow with the screen up to a tablet. Nothing scrolls; no text is under 14px.
 */
export const GROUND = "#002A33", ICE = "#C4DFE6", INK = "#F4F5F7", MIST = "#66A5AD";
export const SAFE: CSSProperties = {
  paddingTop: "max(10px, env(safe-area-inset-top))",
  paddingRight: "max(14px, env(safe-area-inset-right))",
  paddingBottom: "max(10px, env(safe-area-inset-bottom))",
  paddingLeft: "max(14px, env(safe-area-inset-left))",
};

export interface RideViewData {
  ride: Ride;
  phases: Phase[];
  /** Index of the current phase in `phases`. */
  idx: number;
  segStarts: number[];
  segDurations: number[];
  elapsed: number;
  total: number;
  phaseLeft: number;
  tapIn: number;
  now?: RideTrack;
  next?: RideTrack;
}

const ROLE_LABEL = { warmup: "WARM-UP", steady: "STEADY", recover: "RECOVER", cooldown: "COOL-DOWN" } as const;

export function segLabel(s: RideSegment): string {
  if (s.type === "flat") return ROLE_LABEL[s.role];
  if (s.type === "hill") return "HILL";
  return s.workKind === "sprint" ? "SPRINTS" : "INTERVALS";
}

/** The small tag after the segment label: hill step, or interval round. */
export function phaseTag(p: Phase): string {
  if (p.kind === "hillStep") return `STEP ${p.step}/${p.stepsTotal}`;
  if (p.kind === "work" || p.kind === "rest") return `${p.label} ${p.round}/${p.roundsTotal}`;
  return "";
}

/** The cue shown for a phase: the segment's own words. */
export const segCue = (ride: Ride, p: Phase) => ride.segments[p.segmentIndex].cue;

const num = "num font-light";

export default function RideView({ v, landscape, onPause, onGuide, onMore }: {
  v: RideViewData; landscape: boolean; onPause: () => void; onGuide: () => void; onMore: () => void;
}) {
  const { ride, phases, idx, elapsed, total, phaseLeft, tapIn, now, next } = v;
  const p = phases[idx];
  const prev = phases[idx - 1];
  const nextP = phases[idx + 1];
  const seg = ride.segments[p.segmentIndex];
  const segCount = ride.segments.length;
  const playlist = ride.playlistUrl;
  const tag = phaseTag(p);
  const label = `${segLabel(seg)} ${p.segmentIndex + 1}/${segCount}${tag ? ` · ${tag}` : ""}`;
  const cap = landscape ? "26dvh" : "17dvh";
  const segElapsed = elapsed - v.segStarts[p.segmentIndex];
  // Hill step cue: where effort goes next, and when.
  const hillNext = p.kind === "hillStep" && nextP && nextP.segmentIndex === p.segmentIndex ? nextP : undefined;
  const stepCue = p.kind === "hillStep" ? (hillNext ? `Up to ${fmtTarget(hillNext.effort)} in ${fmtClock(Math.ceil(phaseLeft))}` : "Top of the hill. Hold it.") : undefined;
  // The step pulse: only for steps after the first (the segment-start change is announced by the flip screen).
  const pulse = p.kind === "hillStep" && (p.step ?? 1) > 1;

  return (
    <>
      {/* header */}
      {landscape ? (
        <div className="flex items-end justify-between gap-2 pb-1">
          <Stat label="Elapsed" value={fmtClock(elapsed)} />
          <div className="flex min-w-0 flex-col items-center">
            <span className="max-w-full truncate text-[14px] font-medium uppercase tracking-[.12em] text-ice">{label}</span>
            <span className={`${num} font-extralight`} style={{ fontSize: "clamp(44px, 15dvh, 130px)" }}>{fmtClock(Math.ceil(phaseLeft))}</span>
          </div>
          <Stat label="Left" value={fmtClock(Math.ceil(total - elapsed))} right />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 pb-2">
          <div className="flex w-full items-end justify-between gap-2">
            <Stat label="Elapsed" value={fmtClock(elapsed)} />
            <Stat label="Left" value={fmtClock(Math.ceil(total - elapsed))} right />
          </div>
          <span className="max-w-full truncate text-[14px] font-medium uppercase tracking-[.12em] text-ice">{label}</span>
          <span className={`${num} font-extralight`} style={{ fontSize: "clamp(64px, 12dvh, 170px)" }}>{fmtClock(Math.ceil(phaseLeft))}</span>
        </div>
      )}

      <Timeline durations={v.segDurations} index={p.segmentIndex} segElapsed={segElapsed} />

      {/* targets */}
      <div className={`flex min-h-0 flex-1 gap-2 pt-2 ${landscape ? "flex-row" : "flex-col"}`} style={{ gap: "clamp(8px, 1.4dvh, 20px)" }}>
        <Tile
          grow={landscape ? 1 : 1.3} label="Effort" unit="1–10" color={MIST} target={p.effort} cap={cap}
          action={<button aria-label="What do the effort numbers mean?" onClick={onGuide} className="flex h-[28px] w-[28px] items-center justify-center rounded-full border-2 border-line text-[14px] font-medium text-ice">?</button>}
          numClass={pulse ? "effort-pulse" : ""} numKey={idx}
          word={effortWord(p.effort)}
          cue={stepCue}
          bar={p.kind === "hillStep" ? <HillBar phases={phases.filter((x) => x.segmentIndex === p.segmentIndex)} elapsed={elapsed} /> : undefined}
          foot={wasLine(prev?.effort, p.effort, !prev)}
        />
        <Tile grow={1} label="Cadence" unit="RPM" color={ICE} target={p.cadence} cap={cap} foot={wasLine(prev?.cadence, p.cadence, !prev)} />
      </div>

      {/* cue */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <span className="min-w-0 truncate text-[17px] font-light">{segCue(ride, p)}</span>
        <span className="flex flex-none items-center gap-1 text-[14px] text-mist"><HandIcon size={16} color={MIST} />Tap {fmtClock(tapIn)}</span>
      </div>

      {/* bottom bar */}
      <div className={`flex gap-2 pt-2 ${landscape ? "flex-row items-center" : "flex-col"}`}>
        {landscape && <PauseButton onClick={onPause} />}
        <Info nextP={nextP} phaseLeft={phaseLeft} now={now ? `${now.title} · ${now.artist}` : undefined} next={next ? `${next.title} · ${next.artist}` : undefined} />
        <div className={`flex flex-none gap-2 ${landscape ? "" : "w-full"}`}>
          {!landscape && <PauseButton onClick={onPause} grow />}
          <IconButton label="Open playlist" href={playlist}><NoteIcon size={22} color={playlist ? ICE : MIST} /></IconButton>
          <IconButton label="More controls" onClick={onMore}><span className="text-[22px] leading-none text-ink">⋯</span></IconButton>
        </div>
      </div>
    </>
  );
}

function PauseButton({ onClick, grow }: { onClick: () => void; grow?: boolean }) {
  return (
    <button onClick={onClick} aria-label="Pause ride"
      className={`flex h-[52px] flex-none items-center justify-center gap-2 rounded-full bg-ice px-6 text-[16px] font-medium uppercase tracking-[.08em] text-ground ${grow ? "flex-1" : "min-w-[130px]"}`}>
      <PauseIcon size={18} color={GROUND} />Pause
    </button>
  );
}

function IconButton({ label, children, href, onClick }: { label: string; children: ReactNode; href?: string; onClick?: () => void }) {
  const cls = "flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full border-2 border-line bg-tile";
  if (onClick) return <button aria-label={label} onClick={onClick} className={cls}>{children}</button>;
  return href
    ? <a aria-label={label} href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>
    : <span aria-label={`${label} (none set)`} className={`${cls} opacity-40`}>{children}</span>;
}

function Info({ nextP, phaseLeft, now, next }: { nextP?: Phase; phaseLeft: number; now?: string; next?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
      <span className="truncate text-[16px] font-light leading-tight">
        <span className="mr-2 text-[14px] font-medium uppercase tracking-[.1em] text-mist">{nextP ? `Next · ${fmtClock(Math.ceil(phaseLeft))}` : "Last one"}</span>
        {nextP ? (
          <>
            {nextP.label.toUpperCase()} <span className="text-ice">{fmtTarget(nextP.cadence)}</span> <span className="text-mist">· effort {fmtTarget(nextP.effort)}</span>
          </>
        ) : "Finish strong"}
      </span>
      <span className="truncate text-[14px] font-light leading-tight text-mist">{now ? `♪ ${now}${next ? `  ›  ${next}` : ""}` : "♪ No tracklist yet"}</span>
    </div>
  );
}

function Stat({ label, value, right }: { label: string; value: string; right?: boolean }) {
  return (
    <div className={`flex flex-none flex-col gap-[2px] ${right ? "items-end" : "items-start"}`} style={{ minWidth: "22%" }}>
      <span className="text-[14px] font-medium uppercase tracking-[.14em] text-mist">{label}</span>
      <span className={num} style={{ fontSize: "clamp(22px, 5dvh, 46px)", letterSpacing: "-.01em" }}>{value}</span>
    </div>
  );
}

function Timeline({ durations, index, segElapsed }: { durations: number[]; index: number; segElapsed: number }) {
  return (
    <div className="flex h-[12px] gap-[3px]" aria-label="Ride timeline">
      {durations.map((d, i) => {
        const style = { flex: `${d} 1 0` };
        if (i < index) return <div key={i} className="rounded-[3px] bg-line" style={style} />;
        if (i === index)
          return (
            <div key={i} className="box-border overflow-hidden rounded-[3px] border border-ice bg-tile" style={style}>
              <div className="h-full bg-ice" style={{ width: `${Math.min(100, (segElapsed / d) * 100)}%` }} />
            </div>
          );
        return <div key={i} className="box-border rounded-[3px] border border-line bg-tile" style={style} />;
      })}
    </div>
  );
}

/** The climb progress bar: one slice per effort level, the current one filling. */
function HillBar({ phases, elapsed }: { phases: Phase[]; elapsed: number }) {
  return (
    <div className="flex h-[10px] gap-[3px]" aria-label="Hill progress">
      {phases.map((s, i) => {
        const style = { flex: `${s.endSec - s.startSec} 1 0` };
        if (elapsed >= s.endSec) return <div key={i} className="rounded-[3px] bg-ice" style={style} />;
        if (elapsed >= s.startSec)
          return (
            <div key={i} className="box-border overflow-hidden rounded-[3px] border border-ice bg-ground" style={style}>
              <div className="h-full bg-ice" style={{ width: `${((elapsed - s.startSec) / (s.endSec - s.startSec)) * 100}%` }} />
            </div>
          );
        return <div key={i} className="box-border rounded-[3px] border border-line bg-ground" style={style} />;
      })}
    </div>
  );
}

function Tile({ label, unit, color, target, foot, cap, grow, action, numClass = "", numKey, word, cue, bar }: {
  label: string; unit: string; color: string; target: Parameters<typeof fmtTarget>[0]; foot: string; cap: string; grow: number;
  action?: ReactNode; numClass?: string; numKey?: number; word?: string; cue?: string; bar?: ReactNode;
}) {
  const text = fmtTarget(target);
  return (
    <div className="phone-tile flex min-h-0 flex-col rounded-[18px] border-2 border-line bg-tile px-3 py-2" style={{ flex: `${grow} 1 0` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-medium uppercase tracking-[.16em]" style={{ color }}>{label}</span>
        <span className="flex items-center gap-2 text-[14px] tracking-[.1em] text-mist">{unit}{action}</span>
      </div>
      <div className="fit-area flex min-h-[48px] flex-1 items-center justify-center overflow-hidden">
        <span key={numKey} className={`fit-num ${numClass}`} style={{ color, ["--chars" as string]: Math.max(text.length, 3), ["--cap" as string]: cap } as CSSProperties}>{text}</span>
      </div>
      {(word || cue) && (
        <span className="truncate text-center text-[16px] font-medium">
          {word && <span style={{ color }}>{word}</span>}
          {word && cue && <span className="text-mist"> · </span>}
          {cue && <span className="text-ink">{cue}</span>}
        </span>
      )}
      {bar && <div className="py-1">{bar}</div>}
      <span className="truncate text-center text-[14px] text-mist">{foot}</span>
    </div>
  );
}

/* ----------------------------------------------------------------- change */
const CADENCE_WORD = { up: "FASTER ↑", down: "SLOWER ↓", same: "SAME" } as const;
const EFFORT_WORD = { up: "HARDER ↑", down: "EASIER ↓", same: "SAME" } as const;

/** The flip screen: the last 10 seconds of a segment. Never shown between hill steps. */
export function ChangeView({ v, landscape }: { v: RideViewData; landscape: boolean }) {
  const { ride, phases, idx, elapsed, total, phaseLeft } = v;
  const cur = phases[idx];
  const next = phases[idx + 1];
  const nextSeg = ride.segments[next.segmentIndex];
  const nextTag = phaseTag(next);
  const small = landscape ? "17dvh" : "11dvh";
  return (
    <>
      <div className="flex items-center justify-between gap-2 text-[14px] font-medium uppercase tracking-[.12em]">
        <span className="truncate">{fmtClock(elapsed)} elapsed · {fmtClock(Math.ceil(total - elapsed))} left</span>
        <span className="flex-none">Segment {cur.segmentIndex + 1}/{ride.segments.length}</span>
      </div>
      <div className={`flex min-h-0 flex-1 ${landscape ? "flex-row items-center gap-6" : "flex-col justify-center gap-3"}`}>
        <div className={`flex flex-none flex-col items-center ${landscape ? "w-[34%]" : "w-full"}`}>
          <span className="text-[14px] font-medium uppercase tracking-[.22em]">Change in</span>
          <span className="num font-extralight" style={{ fontSize: landscape ? "min(56dvh, 26vw)" : "min(26dvh, 52vw)", lineHeight: 0.95 }}>{Math.max(1, Math.ceil(phaseLeft))}</span>
        </div>
        <div className={`flex min-w-0 flex-col gap-2 ${landscape ? "flex-1" : "w-full"}`}>
          <div className="flex min-w-0 flex-col gap-[2px]">
            <span className="text-[14px] font-medium uppercase tracking-[.22em]">Next</span>
            <span className="truncate font-extralight uppercase leading-none" style={{ fontSize: landscape ? "min(15dvh, 8vw)" : "min(8dvh, 14vw)", letterSpacing: "-.02em" }}>{next.label}</span>
            <span className="truncate text-[16px] font-normal">{fmtClock(next.endSec - next.startSec)}{nextTag ? ` · ${nextTag}` : ""} · {nextSeg.cue}</span>
          </div>
          <div className="flex flex-row gap-2">
            <ChangeCard label="Cadence" color={ICE} word={CADENCE_WORD[direction(cur.cadence, next.cadence)]} value={next.cadence} from={cur.cadence} cap={small} />
            <ChangeCard label="Effort" color={MIST} word={EFFORT_WORD[direction(cur.effort, next.effort)]} value={next.effort} from={cur.effort} cap={small} sub={effortWord(next.effort)} />
          </div>
        </div>
      </div>
    </>
  );
}

function ChangeCard({ label, color, word, value, from, cap, sub }: { label: string; color: string; word: string; value: Parameters<typeof fmtTarget>[0]; from: Parameters<typeof fmtTarget>[0]; cap: string; sub?: string }) {
  const text = fmtTarget(value);
  return (
    <div className="phone-tile flex flex-1 flex-col gap-1 rounded-[16px] px-3 py-2" style={{ background: GROUND }}>
      <div className="flex flex-col">
        <span className="text-[14px] font-medium uppercase tracking-[.14em]" style={{ color }}>{label}</span>
        <span className="whitespace-nowrap text-[16px] font-medium tracking-[.06em] text-ink">{word}</span>
      </div>
      <span className="phone-num text-center" style={{ color, ["--chars" as string]: Math.max(text.length, 3), ["--cap" as string]: cap } as CSSProperties}>{text}</span>
      {sub && <span className="truncate text-center text-[16px] font-medium" style={{ color }}>{sub}</span>}
      <span className="truncate text-center text-[14px] text-mist">from {fmtTarget(from)}</span>
    </div>
  );
}
