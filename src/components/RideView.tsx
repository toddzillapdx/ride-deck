import type { CSSProperties, ReactNode } from "react";
import { direction, fmtClock, fmtTarget } from "@/lib/format";
import { effortWord } from "@/lib/engine";
import { NoteIcon } from "./Icons";
import { PauseIcon } from "./RideControls";
import { GROUND, ICE, INK, MIST, WORK_BG } from "@/lib/rideTheme";
import { countdownInfo, nextWord, sections, segTitle, segmentBar, type RideViewData } from "@/lib/rideLabels";


/**
 * The one ride screen, for every segment type. Responsive: portrait stacks the tiles (iPhone first), landscape puts them
 * side by side. The layout never changes between segment types: effort and cadence stay exactly where they are, and
 * WORK/REST (intervals) only change a label and the background tint. Nothing scrolls; no text is under 14px.
 */
export { GROUND, ICE, INK, MIST };
export const SAFE: CSSProperties = {
  paddingTop: "max(10px, env(safe-area-inset-top))",
  paddingRight: "max(14px, env(safe-area-inset-right))",
  paddingBottom: "max(10px, env(safe-area-inset-bottom))",
  paddingLeft: "max(14px, env(safe-area-inset-left))",
};


function ProgressLine({ v, onIce }: { v: RideViewData; onIce: boolean }) {
  const s = sections(v.ride, v.segDurations);
  const pct = Math.min(100, Math.max(0, (v.elapsed / v.total) * 100));
  const lit = onIce ? GROUND : ICE, dim = onIce ? "rgba(0,42,51,.28)" : "#07575B";
  const parts = [s.warm, s.ride, s.cool].filter((x) => x > 0);
  return (
    <div className="relative flex-none" style={{ height: 18 }} role="progressbar" aria-label="Ride progress" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="absolute inset-x-0 flex gap-[6px]" style={{ top: 8, height: 3 }}>
        {parts.map((d, i) => <div key={i} className="rounded-full" style={{ flex: `${d} 1 0`, background: dim }} />)}
      </div>
      <div className="absolute overflow-hidden rounded-full" style={{ top: 8, height: 3, left: 0, width: `${pct}%`, background: lit, opacity: 0.55 }} />
      <div className="absolute rounded-full" style={{ top: 0, height: 18, width: 4, left: `calc(${pct}% - 2px)`, background: lit }} />
    </div>
  );
}

/**
 * This segment's own progress: the same thin line and vertical marker as the ride line at the top, with thin ruled
 * breaks where it changes inside (hill steps and recovery, interval rounds). One look for every segment type.
 */
function SegmentBar({ v }: { v: RideViewData }) {
  const { pct, breaks } = segmentBar(v);
  return (
    <div className="relative flex-none" style={{ height: 18 }} role="progressbar" aria-label="Segment progress" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="absolute inset-x-0 rounded-full" style={{ top: 8, height: 3, background: "#07575B" }} />
      <div className="absolute rounded-full" style={{ top: 8, height: 3, left: 0, width: `${pct}%`, background: ICE, opacity: 0.55 }} />
      {breaks.map((f, i) => <div key={i} className="absolute" style={{ top: 3, height: 13, width: 2, left: `calc(${f * 100}% - 1px)`, background: ICE, opacity: 0.7 }} />)}
      <div className="absolute rounded-full" style={{ top: 0, height: 18, width: 4, left: `calc(${pct}% - 2px)`, background: ICE }} />
    </div>
  );
}

/** "Was 4" only when something changed. No noise when it did not, and no "up 3" arithmetic. */
function changeLine(prev: Parameters<typeof fmtTarget>[0], cur: Parameters<typeof fmtTarget>[0]): string {
  if (prev === undefined || cur === undefined) return "";
  const mid = (t: typeof cur) => (Array.isArray(t) ? (t[0] + t[1]) / 2 : (t as number));
  return Math.round(mid(cur!) - mid(prev!)) === 0 ? "" : `Was ${fmtTarget(prev)}`;
}

const num = "num font-light";

export default function RideView({ v, landscape, onPause, onGuide, onMore }: {
  v: RideViewData; landscape: boolean; onPause: () => void; onGuide: () => void; onMore: () => void;
}) {
  const { ride, phases, idx, elapsed, total, phaseLeft, now } = v;
  const p = phases[idx];
  const prev = phases[idx - 1];
  const nextP = phases[idx + 1];
  const seg = ride.segments[p.segmentIndex];
  const playlist = ride.playlistUrl;
  const interval = p.kind === "work" || p.kind === "rest";
  // The ride screen keeps one look for every segment: no tint for WORK. Only the full-screen countdowns change the screen.
  const onIce = false;
  const cap = landscape ? "26dvh" : "17dvh";
  // Hill step cue: where effort goes next, and when.
  const hillNext = p.kind === "hillStep" && nextP && nextP.segmentIndex === p.segmentIndex ? nextP : undefined;
  const stepCue = p.kind === "hillStep" ? (hillNext ? (hillNext.kind === "hillCool" ? `Recover in ${fmtClock(Math.ceil(phaseLeft))}` : `Up to ${fmtTarget(hillNext.effort)} in ${fmtClock(Math.ceil(phaseLeft))}`) : "Top of the hill. Hold it.") : p.kind === "hillCool" ? "Ease off and spin it out." : undefined;
  // The step pulse: only for steps after the first (the segment-start change is announced by the flip screen).
  // Effort and cadence are drawn at the same size: both fit the longer of the two numbers.
  const sharedChars = Math.max(fmtTarget(p.effort).length, fmtTarget(p.cadence).length);
  const pulse = p.kind === "hillStep" && (p.step ?? 1) > 1;
  const muted = onIce ? { color: GROUND, opacity: 0.75 } : { color: MIST };

  const label = (
    <span className="flex max-w-full items-center justify-center gap-2 truncate text-[14px] font-medium uppercase tracking-[.12em]" style={{ color: onIce ? GROUND : ICE }}>
      <span className="truncate">{segTitle(seg)}</span>
      {(interval || p.kind === "hillCool") && <span className="flex-none rounded-full px-3 py-[2px] text-[14px] font-medium tracking-[.1em]" style={p.kind === "work" ? { background: ICE, border: `2px solid ${ICE}`, color: GROUND } : { border: `2px solid ${ICE}`, color: ICE }}>{p.kind === "work" ? "WORK" : p.kind === "hillCool" ? "RECOVER" : "REST"}</span>}
    </span>
  );
  const clock = <span className={`${num} font-extralight`} style={{ fontSize: landscape ? "clamp(44px, 15dvh, 130px)" : "clamp(64px, 12dvh, 170px)" }}>{fmtClock(Math.ceil(phaseLeft))}</span>;

  return (
    <>
      <ProgressLine v={v} onIce={onIce} />
      {/* header */}
      {landscape ? (
        <div className="flex items-end justify-between gap-2 pb-1 pt-1">
          <Stat label="Elapsed" value={fmtClock(elapsed)} onIce={onIce} />
          <div className="flex min-w-0 flex-col items-center">{label}{clock}</div>
          <Stat label="Left" value={fmtClock(Math.ceil(total - elapsed))} right onIce={onIce} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 pb-1 pt-1">
          <div className="flex w-full items-end justify-between gap-2">
            <Stat label="Elapsed" value={fmtClock(elapsed)} onIce={onIce} />
            <Stat label="Left" value={fmtClock(Math.ceil(total - elapsed))} right onIce={onIce} />
          </div>
          {label}
          {clock}
        </div>
      )}
      <SegmentBar v={v} />

      {/* targets: always in the same place */}
      <div className={`flex min-h-0 flex-1 gap-2 pt-2 ${landscape ? "flex-row" : "flex-col"}`} style={{ gap: "clamp(8px, 1.4dvh, 20px)" }}>
        <Tile
          grow={landscape ? 1 : 1.3} label="Effort" color={ICE} chars={sharedChars} target={p.effort} cap={cap} dark={onIce}
          action={<button aria-label="What do the effort numbers mean?" onClick={onGuide} className="flex h-[28px] w-[28px] items-center justify-center rounded-full border-2 border-line text-[14px] font-medium text-ice">?</button>}
          numClass={pulse ? "effort-pulse" : ""} numKey={idx}
          cue={stepCue}
          foot={changeLine(prev?.effort, p.effort)}
        />
        <Tile grow={1} label="Cadence" unit="RPM" color={ICE} chars={sharedChars} target={p.cadence} cap={cap} dark={onIce} foot={changeLine(prev?.cadence, p.cadence)} />
      </div>

      {/* cue */}
      <div className="flex items-center pt-2"><span className="min-w-0 truncate text-[17px] font-light">{seg.cue}</span></div>

      {/* bottom: what is next, the current song, and the controls */}
      <div className={`flex gap-2 pt-2 ${landscape ? "flex-row items-center" : "flex-col"}`}>
        {landscape && <PauseButton onClick={onPause} onIce={onIce} />}
        {/* one line: what is next, then the song that should be playing. Same size and weight, different colors. */}
        <div className="flex min-w-0 flex-1 items-baseline gap-3 text-[17px] font-normal leading-tight">
          <span className="flex-none uppercase tracking-[.04em]" style={{ color: ICE }}>Next {nextP ? nextWord(ride, p, nextP) : "FINISH"}</span>
          {now && <span className="min-w-0 truncate" style={{ color: MIST }}>♪ {now.title} · {now.artist}</span>}
        </div>
        <div className={`flex flex-none gap-2 ${landscape ? "" : "w-full"}`}>
          {!landscape && <PauseButton onClick={onPause} grow onIce={onIce} />}
          {playlist && <a href={playlist} target="_blank" rel="noopener noreferrer" className="flex h-[52px] flex-none items-center gap-2 rounded-full border-2 border-line bg-tile px-4 text-[15px] font-medium text-ink"><NoteIcon size={18} color={ICE} />Playlist</a>}
          <button onClick={onMore} className="flex h-[52px] flex-none items-center rounded-full border-2 border-line bg-tile px-5 text-[15px] font-medium text-ink">More</button>
        </div>
      </div>
    </>
  );
}

function PauseButton({ onClick, grow, onIce }: { onClick: () => void; grow?: boolean; onIce?: boolean }) {
  return (
    <button onClick={onClick} aria-label="Pause ride"
      className={`flex h-[52px] flex-none items-center justify-center gap-2 rounded-full px-6 text-[16px] font-medium uppercase tracking-[.08em] ${onIce ? "bg-ground text-ice" : "bg-ice text-ground"} ${grow ? "flex-1" : "min-w-[130px]"}`}>
      <PauseIcon size={18} color={onIce ? ICE : GROUND} />Pause
    </button>
  );
}

function Stat({ label, value, right, onIce }: { label: string; value: string; right?: boolean; onIce?: boolean }) {
  return (
    <div className={`flex flex-none flex-col gap-[2px] ${right ? "items-end" : "items-start"}`} style={{ minWidth: "22%" }}>
      <span className="text-[14px] font-medium uppercase tracking-[.14em]" style={{ color: onIce ? GROUND : MIST, opacity: onIce ? 0.75 : 1 }}>{label}</span>
      <span className={num} style={{ fontSize: "clamp(22px, 5dvh, 46px)", letterSpacing: "-.01em" }}>{value}</span>
    </div>
  );
}

function Tile({ label, unit, color, target, chars, foot, cap, grow, action, numClass = "", numKey, word, cue, bar, dark }: {
  label: string; unit?: string; color: string; target: Parameters<typeof fmtTarget>[0]; chars?: number; foot: string; cap: string; grow: number;
  action?: ReactNode; numClass?: string; numKey?: number; word?: string; cue?: string; bar?: ReactNode;
  /** On the ice (WORK) screen the tiles are dark, so their text keeps its own colors. */
  dark?: boolean;
}) {
  const text = fmtTarget(target);
  return (
    <div className={`phone-tile flex min-h-0 flex-col rounded-[18px] border-2 px-3 py-2 ${dark ? "border-ground bg-ground text-ink" : "border-line bg-tile"}`} style={{ flex: `${grow} 1 0` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-medium uppercase tracking-[.16em]" style={{ color }}>{label}</span>
        <span className="flex items-center gap-2 whitespace-nowrap text-[14px] tracking-[.1em] text-mist">{unit}{action}</span>
      </div>
      <div className="fit-area flex min-h-[48px] flex-1 items-center justify-center overflow-hidden">
        <span key={numKey} className={`fit-num ${numClass}`} style={{ color, ["--chars" as string]: Math.max(chars ?? text.length, 3), ["--cap" as string]: cap } as CSSProperties}>{text}</span>
      </div>
      {(word || cue) && (
        <span className="truncate text-center text-[16px] font-medium">
          {word && <span style={{ color }}>{word}</span>}
          {word && cue && <span className="text-mist"> · </span>}
          {cue && <span className="text-ink">{cue}</span>}
        </span>
      )}
      {bar && <div className="py-1">{bar}</div>}
      {foot && <span className="truncate text-center text-[14px] text-mist">{foot}</span>}
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
            <span className="truncate font-extralight uppercase leading-none" style={{ fontSize: landscape ? "min(15dvh, 8vw)" : "min(8dvh, 14vw)", letterSpacing: "-.02em" }}>{nextSeg.type === "interval" ? "Intervals" : next.label}</span>
            <span className="truncate text-[16px] font-normal">
              {nextSeg.type === "interval"
                ? `${nextSeg.workKind} · ${nextSeg.ratio} · ${nextSeg.workSec}s on / ${nextSeg.restSec}s off x ${nextSeg.rounds} · ${nextSeg.cue}`
                : `${fmtClock(next.endSec - next.startSec)} · ${nextSeg.cue}`}
            </span>
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


/** The giant 3-2-1 with what is coming. Covers the screen; taps pass through. */
export function Countdown321({ info }: { info: { left: number; text: string; ice: boolean } }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center gap-4" style={{ background: info.ice ? WORK_BG : GROUND }} aria-live="assertive">
      <span className="num font-extralight" style={{ fontSize: "min(60dvh, 80vw)", color: info.ice ? GROUND : ICE }}>{Math.ceil(info.left)}</span>
      <span className="px-4 text-center text-[28px] font-medium uppercase tracking-[.12em]" style={{ color: info.ice ? GROUND : ICE }}>{info.text}</span>
    </div>
  );
}
