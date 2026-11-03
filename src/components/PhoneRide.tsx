"use client";
import type { CSSProperties, ReactNode } from "react";
import { direction, fmtClock, fmtTarget, wasLine } from "@/lib/format";
import type { Segment, Target } from "@/lib/types";
import type { Step } from "@/lib/pacing";
import { HandIcon, NoteIcon } from "./Icons";
import PauseOverlay from "./PauseOverlay";
import TapBanner from "./TapBanner";
import { BigButton, CtlButton, HoldButton, PauseIcon } from "./RideControls";
import type { RideView } from "./RideScreen";

/**
 * Phone layout for the whole ride: start screen, ride, change warning, tap prompt, pause and menu.
 * Real responsive layout (not the scaled tablet canvas): big numerals, thumb-sized buttons, padding
 * for notches and the home indicator, and a landscape and a portrait arrangement.
 */
export interface PhoneRideProps {
  landscape: boolean;
  phase: "ready" | "riding" | "done";
  running: boolean;
  speed: number;
  v: RideView;
  stepLeft: number;
  warning: boolean;
  showTap: boolean;
  ignoredSec: number;
  menu: boolean;
  setMenu: (b: boolean) => void;
  onStart: () => void;
  onToggle: () => void;
  onSkip: () => void;
  onBack: () => void;
  onEnd: () => void;
  finish: ReactNode;
}

const GROUND = "#002A33", ICE = "#C4DFE6", INK = "#F4F5F7";
const TYPE_LABEL: Record<Segment["type"], string> = { warmup: "WARM-UP", flat: "FLAT", climb: "CLIMB", sprint: "SPRINT", recover: "RECOVER", cooldown: "COOL-DOWN" };
const CADENCE_WORD = { up: "FASTER ↑", down: "SLOWER ↓", same: "SAME" } as const;
const RESIST_WORD = { up: "HEAVIER ↑", down: "LIGHTER ↓", same: "SAME" } as const;
const SAFE: CSSProperties = {
  paddingTop: "max(10px, env(safe-area-inset-top))",
  paddingRight: "max(14px, env(safe-area-inset-right))",
  paddingBottom: "max(10px, env(safe-area-inset-bottom))",
  paddingLeft: "max(14px, env(safe-area-inset-left))",
};

export default function PhoneRide(p: PhoneRideProps) {
  const { v, landscape } = p;
  const change = p.phase === "riding" && p.warning;
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: change ? ICE : GROUND, color: change ? GROUND : INK, ...SAFE }}>
      {p.phase === "ready" && <Ready {...p} />}
      {p.phase === "riding" && (change ? <Change {...p} /> : <Ride {...p} />)}
      {p.phase === "riding" && p.showTap && !change && <TapBanner ignoredSec={p.ignoredSec} compact />}
      {p.phase === "riding" && p.menu && p.running && <Menu {...p} />}
      {p.phase === "riding" && !p.running && (
        <PauseOverlay fixed elapsed={v.elapsed} remaining={v.total - v.elapsed} onResume={p.onToggle} onEnd={p.onEnd} />
      )}
      {p.phase === "done" && p.finish}
      {/* keeps landscape referenced for layout branches above */}
      <span hidden data-landscape={landscape} />
    </div>
  );
}

/* ---------------------------------------------------------------- ready */
function Ready({ v, speed, onStart, landscape }: PhoneRideProps) {
  const w = v.workout;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="text-[11px] font-medium uppercase tracking-[.2em] text-mist">{w.name}</span>
      <span className="font-light" style={{ fontSize: landscape ? "min(8dvh, 28px)" : 28 }}>{fmtClock(v.total)} · {w.segments.length} segments</span>
      <BigButton onClick={onStart} small>Start ride</BigButton>
      <div className="flex items-center gap-5">
        {w.playlistUrl && (
          <a href={w.playlistUrl} target="_blank" rel="noopener noreferrer" className="flex h-[48px] items-center gap-2 rounded-full border-2 border-line px-5 text-[14px] font-medium text-ice">
            <NoteIcon size={18} color={ICE} />Open playlist
          </a>
        )}
        <a href="/" className="flex h-[48px] items-center px-2 text-[13px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
      </div>
      {speed !== 1 && <span className="text-[12px] text-mist">Test mode: {speed}x clock</span>}
    </div>
  );
}

/* ----------------------------------------------------------------- ride */
function Ride(p: PhoneRideProps) {
  const { v, landscape, stepLeft } = p;
  const { workout, index, step, prevStep, nextStep, elapsed, total, tapIn, now, next } = v;
  const segs = workout.segments;
  const playlist = workout.playlistUrl;
  const label = `${TYPE_LABEL[step.type]} ${index + 1}/${segs.length}${step.tag ? ` · ${step.tag}` : ""}`;
  const cap = landscape ? "27dvh" : "16dvh";

  return (
    <>
      {/* header: landscape is one row; portrait gives the countdown its own row so nothing collides */}
      {landscape ? (
        <div className="flex items-end justify-between gap-2 pb-1">
          <Stat label="Elapsed" value={fmtClock(elapsed)} />
          <div className="flex min-w-0 flex-col items-center">
            <span className="max-w-full truncate text-[10px] font-medium uppercase tracking-[.12em] text-ice">{label}</span>
            <span className="num font-extralight" style={{ fontSize: "clamp(38px, 14dvh, 76px)" }}>{fmtClock(Math.ceil(stepLeft))}</span>
          </div>
          <Stat label="Left" value={fmtClock(Math.ceil(total - elapsed))} right />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 pb-2">
          <div className="flex w-full items-end justify-between">
            <Stat label="Elapsed" value={fmtClock(elapsed)} small />
            <span className="min-w-0 flex-1 truncate pb-[3px] text-center text-[10px] font-medium uppercase tracking-[.12em] text-ice">{label}</span>
            <Stat label="Left" value={fmtClock(Math.ceil(total - elapsed))} right small />
          </div>
          <span className="num font-extralight" style={{ fontSize: "clamp(60px, 11dvh, 104px)" }}>{fmtClock(Math.ceil(stepLeft))}</span>
        </div>
      )}

      <Timeline segs={segs} index={index} segElapsed={v.segElapsed} />

      {/* targets */}
      <div className={`flex min-h-0 flex-1 gap-2 pt-2 ${landscape ? "flex-row" : "flex-col"}`}>
        <Tile label="Cadence" unit="RPM" color={ICE} target={step.cadence} foot={wasLine(prevStep?.cadence, step.cadence, !prevStep)} cap={cap} />
        <Tile label="Resistance" unit="0–100" color="#66A5AD" target={step.resistance} foot={wasLine(prevStep?.resistance, step.resistance, !prevStep)} cap={cap} />
      </div>

      {/* cue */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <span className="min-w-0 truncate text-[15px] font-light">{step.cue}</span>
        <span className="flex flex-none items-center gap-1 text-[11px] text-mist"><HandIcon size={13} color="#66A5AD" />Tap {fmtClock(tapIn)}</span>
      </div>

      {/* bottom bar */}
      <div className={`flex gap-2 pt-2 ${landscape ? "flex-row items-center" : "flex-col"}`}>
        {landscape && <PauseButton onClick={p.onToggle} />}
        <Info nextStep={nextStep} stepLeft={stepLeft} now={now?.title ? `${now.title} · ${now.artist}` : undefined} next={next ? `${next.title} · ${next.artist}` : undefined} />
        <div className={`flex flex-none gap-2 ${landscape ? "" : "w-full"}`}>
          {!landscape && <PauseButton onClick={p.onToggle} grow />}
          <IconButton label="Open playlist" href={playlist}><NoteIcon size={22} color={playlist ? ICE : "#66A5AD"} /></IconButton>
          <IconButton label="More controls" onClick={() => p.setMenu(true)}><span className="text-[22px] leading-none text-ink">⋯</span></IconButton>
        </div>
      </div>
    </>
  );
}

function PauseButton({ onClick, grow }: { onClick: () => void; grow?: boolean }) {
  return (
    <button onClick={onClick} aria-label="Pause ride"
      className={`flex h-[52px] flex-none items-center justify-center gap-2 rounded-full bg-ice px-6 text-[15px] font-medium uppercase tracking-[.08em] text-ground ${grow ? "flex-1" : "min-w-[130px]"}`}>
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

function Info({ nextStep, stepLeft, now, next }: { nextStep?: Step; stepLeft: number; now?: string; next?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
      <span className="truncate text-[13px] font-light leading-tight">
        <span className="mr-2 text-[10px] font-medium uppercase tracking-[.14em] text-mist">{nextStep ? `Next · ${fmtClock(Math.ceil(stepLeft))}` : "Last step"}</span>
        {nextStep ? (
          <>
            {nextStep.name.toUpperCase()} {fmtClock(nextStep.durationSec)} <span className="text-ice">{fmtTarget(nextStep.cadence)}</span> <span className="text-mist">{fmtTarget(nextStep.resistance)}</span>
          </>
        ) : "Finish strong"}
      </span>
      <span className="truncate text-[12px] font-light leading-tight text-mist">{now ? `♪ ${now}${next ? `  ›  ${next}` : ""}` : "♪ No tracklist yet"}</span>
    </div>
  );
}

function Stat({ label, value, right, small }: { label: string; value: string; right?: boolean; small?: boolean }) {
  return (
    <div className={`flex ${small ? "w-[26%]" : "w-[22%]"} flex-none flex-col gap-[2px] ${right ? "items-end" : "items-start"}`}>
      <span className="text-[10px] font-medium uppercase tracking-[.16em] text-mist">{label}</span>
      <span className="num font-light" style={{ fontSize: small ? 22 : "clamp(20px, 7dvh, 34px)", letterSpacing: "-.01em" }}>{value}</span>
    </div>
  );
}

function Timeline({ segs, index, segElapsed }: { segs: Segment[]; index: number; segElapsed: number }) {
  return (
    <div className="flex h-[10px] gap-[3px] pt-0" aria-label="Ride timeline">
      {segs.map((s, i) => {
        const style = { flex: `${s.durationSec} 1 0` };
        if (i < index) return <div key={i} className="rounded-[3px] bg-line" style={style} />;
        if (i === index)
          return (
            <div key={i} className="box-border overflow-hidden rounded-[3px] border border-ice bg-tile" style={style}>
              <div className="h-full bg-ice" style={{ width: `${Math.min(100, (segElapsed / s.durationSec) * 100)}%` }} />
            </div>
          );
        return <div key={i} className="box-border rounded-[3px] border border-line bg-tile" style={style} />;
      })}
    </div>
  );
}

function Tile({ label, unit, color, target, foot, cap }: { label: string; unit: string; color: string; target: Target | undefined; foot: string; cap: string }) {
  const text = fmtTarget(target);
  return (
    <div className="phone-tile flex min-h-0 flex-1 flex-col rounded-[18px] border-2 border-line bg-tile px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[.16em]" style={{ color }}>{label}</span>
        <span className="text-[10px] tracking-[.1em] text-mist">{unit}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <span className="phone-num" style={{ color, ["--chars" as string]: Math.max(text.length, 3), ["--cap" as string]: cap } as CSSProperties}>{text}</span>
      </div>
      <span className="truncate text-center text-[11px] text-mist">{foot}</span>
    </div>
  );
}

/* --------------------------------------------------------------- change */
function Change({ v, landscape, stepLeft }: PhoneRideProps) {
  const cur = v.step, next = v.nextStep!;
  return (
    <>
      <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[.14em]">
        <span>{fmtClock(v.elapsed)} elapsed · {fmtClock(Math.ceil(v.total - v.elapsed))} left</span>
        <span>Segment {v.index + 1}/{v.workout.segments.length}{cur.tag ? ` · ${cur.tag}` : ""}</span>
      </div>
      <div className={`flex min-h-0 flex-1 ${landscape ? "flex-row items-center gap-6" : "flex-col justify-center gap-3"}`}>
        <div className={`flex flex-none flex-col items-center ${landscape ? "w-[34%]" : "w-full"}`}>
          <span className="text-[11px] font-medium uppercase tracking-[.22em]">Change in</span>
          <span className="num font-extralight" style={{ fontSize: landscape ? "min(56dvh, 26vw)" : "min(26dvh, 52vw)", lineHeight: 0.95 }}>{Math.max(1, Math.ceil(stepLeft))}</span>
        </div>
        <div className={`flex min-w-0 flex-col gap-2 ${landscape ? "flex-1" : "w-full"}`}>
          <div className="flex min-w-0 flex-col gap-[2px]">
            <span className="text-[11px] font-medium uppercase tracking-[.22em]">Next</span>
            <span className="truncate font-extralight uppercase leading-none" style={{ fontSize: landscape ? "min(15dvh, 8vw)" : "min(8dvh, 14vw)", letterSpacing: "-.02em" }}>{next.name}</span>
            <span className="truncate text-[13px] font-normal">{fmtClock(next.durationSec)}{next.tag ? ` · ${next.tag}` : ""} · {next.cue}</span>
          </div>
          <div className={`flex gap-2 ${landscape ? "flex-row" : "flex-row"}`}>
            <ChangeCard label="Cadence" color={ICE} word={CADENCE_WORD[direction(cur.cadence, next.cadence)]} value={next.cadence} from={cur.cadence} landscape={landscape} />
            <ChangeCard label="Resistance" color="#66A5AD" word={RESIST_WORD[direction(cur.resistance, next.resistance)]} value={next.resistance} from={cur.resistance} landscape={landscape} />
          </div>
        </div>
      </div>
    </>
  );
}

function ChangeCard({ label, color, word, value, from, landscape }: { label: string; color: string; word: string; value: Target | undefined; from: Target | undefined; landscape: boolean }) {
  const text = fmtTarget(value);
  return (
    <div className="phone-tile flex flex-1 flex-col gap-1 rounded-[16px] px-3 py-2" style={{ background: GROUND }}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[.14em]" style={{ color }}>{label}</span>
        <span className="text-[10px] font-medium tracking-[.1em] text-ink">{word}</span>
      </div>
      <span className="phone-num text-center" style={{ color, ["--chars" as string]: Math.max(text.length, 3), ["--cap" as string]: landscape ? "17dvh" : "9dvh" } as CSSProperties}>{text}</span>
      <span className="truncate text-center text-[10px] text-mist">{from === undefined ? "" : `from ${fmtTarget(from)}`}</span>
    </div>
  );
}

/* ----------------------------------------------------------------- menu */
function Menu({ landscape, setMenu, onBack, onSkip, onEnd }: PhoneRideProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ground/90 p-4" onClick={() => setMenu(false)}>
      <div className={`flex gap-3 rounded-[24px] border-2 border-line bg-tile p-5 ${landscape ? "flex-row" : "w-full flex-col"}`} onClick={(e) => e.stopPropagation()}>
        <CtlButton onClick={() => { onBack(); setMenu(false); }}>Previous block</CtlButton>
        <CtlButton onClick={() => { onSkip(); setMenu(false); }}>Skip block</CtlButton>
        <HoldButton onHold={onEnd}>Hold to end</HoldButton>
        <CtlButton onClick={() => setMenu(false)} primary>Close</CtlButton>
      </div>
    </div>
  );
}
