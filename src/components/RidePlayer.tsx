"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPhases, phaseAt, resolveSpeed, rideDuration, rideToLegacyWorkout, segmentDuration, segmentStarts, trackAt, type Ride,
} from "@/lib/engine";
import { useRideClock } from "@/lib/rideClock";
import { fmtClock } from "@/lib/format";
import { useLayout } from "@/lib/useLayout";
import RideView, { ChangeView, GROUND, ICE, INK, SAFE, type RideViewData } from "./RideView";
import EffortGuide from "./EffortGuide";
import TapBanner from "./TapBanner";
import FinishScreen from "./FinishScreen";
import PauseOverlay from "./PauseOverlay";
import { BigButton, CtlButton, HoldButton } from "./RideControls";
import { NoteIcon } from "./Icons";

const TAP_EVERY = 600; // tap prompt cadence (seconds of ride time)
const STORE_KEY = "ridedeck-active-ride";
const STALE_MS = 6 * 3600 * 1000;
/** The last this-many seconds of a segment flip the screen (only at a segment boundary). */
export const WARN_SEC = 10;

type Stage = "ready" | "riding" | "done";

/** The speed-up clock is for testing: it works in dev, and in a build made with NEXT_PUBLIC_SPEEDUP=1. Never in production. */
const speedupAllowed = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SPEEDUP === "1";

export default function RidePlayer({ ride }: { ride: Ride }) {
  const layout = useLayout();
  const segs = ride.segments;
  const phases = useMemo(() => buildPhases(ride), [ride]);
  const total = useMemo(() => rideDuration(ride), [ride]);
  const starts = useMemo(() => segmentStarts(ride), [ride]);
  const durations = useMemo(() => segs.map(segmentDuration), [segs]);

  // ?speed=10 or 30 runs the clock faster, for testing only.
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!speedupAllowed) return;
    const n = Number(new URLSearchParams(window.location.search).get("speed"));
    setSpeed(resolveSpeed(n > 0 ? n : undefined, false));
  }, []);

  const clock = useRideClock(speed);
  const [stage, setStage] = useState<Stage>("ready");
  const [menu, setMenu] = useState(false);
  const [guide, setGuide] = useState(false);
  const [nextPrompt, setNextPrompt] = useState(TAP_EVERY);
  const [startedAt, setStartedAt] = useState("");
  const startedAtRef = useRef("");
  const [runId, setRunId] = useState(0); // new id per ride, so each finish records once

  const elapsed = Math.min(total, clock.elapsedMs / 1000);
  const pos = phaseAt(phases, elapsed)!;
  const segIndex = pos.phase.segmentIndex;
  const segElapsed = elapsed - starts[segIndex];

  // --- Keep a ride in progress across a reload (phones can discard the page while you are in the music app).
  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ rideId: ride.id, startedAt: startedAtRef.current, savedAt: Date.now(), ...clock.getState() }));
    } catch { /* storage can be unavailable; the ride still works */ }
  }, [clock, ride.id]);
  const clearActive = useCallback(() => { try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } }, []);

  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
      if (!o || o.rideId !== ride.id || typeof o.accMs !== "number") return;
      if (Date.now() - (typeof o.since === "number" ? o.since : o.savedAt) > STALE_MS) return clearActive();
      startedAtRef.current = o.startedAt || new Date().toISOString();
      setStartedAt(startedAtRef.current);
      clock.restore({ accMs: o.accMs, since: typeof o.since === "number" ? o.since : null });
      setStage("riding");
      const live = typeof o.since === "number" ? Math.max(0, Date.now() - o.since) : 0;
      setNextPrompt((o.accMs + live) / 1000 + TAP_EVERY);
    } catch { /* ignore a corrupt entry */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Finish when the clock reaches the end.
  useEffect(() => {
    if (stage === "riding" && clock.elapsedMs / 1000 >= total) {
      clock.pause();
      clearActive();
      setStage("done");
    }
  }, [stage, clock, total, clearActive]);

  // Screen Wake Lock: best effort, fail silently. The tap prompt is the fallback.
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  const acquire = useCallback(async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl) lock.current = await wl.request("screen");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (stage !== "riding") return;
    acquire();
    const onVis = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock.current?.release().catch(() => {});
    };
  }, [stage, acquire]);

  // Any tap anywhere keeps the screen awake and resets the prompt countdown.
  const onAnyTap = () => setNextPrompt(clock.elapsedMs / 1000 + TAP_EVERY);

  // Controls
  const startRide = () => {
    const iso = new Date().toISOString();
    startedAtRef.current = iso;
    setStartedAt(iso);
    clock.start();
    setStage("riding");
    setNextPrompt(clock.elapsedMs / 1000 + TAP_EVERY);
    persist();
  };
  const toggle = () => {
    if (clock.running) { clock.pause(); setMenu(false); } else clock.start();
    persist();
  };
  const endRide = () => {
    clock.pause();
    clearActive();
    setStage("done");
    setMenu(false);
  };
  const skip = () => {
    if (segIndex >= segs.length - 1) return endRide();
    clock.seek((starts[segIndex] + durations[segIndex]) * 1000);
    persist();
  };
  const back = () => {
    clock.seek((segElapsed > 3 ? starts[segIndex] : starts[Math.max(0, segIndex - 1)]) * 1000);
    persist();
  };
  const again = () => {
    setRunId((n) => n + 1);
    clock.reset();
    clearActive();
    setStage("ready");
    setNextPrompt(TAP_EVERY);
    setMenu(false);
  };

  const { now, next } = trackAt(ride, elapsed);
  const v: RideViewData = {
    ride, phases, idx: pos.index, segStarts: starts, segDurations: durations, elapsed, total,
    phaseLeft: pos.phaseLeftSec, tapIn: Math.max(0, nextPrompt - elapsed), now, next,
  };

  // The flip: only in the last WARN_SEC of the LAST phase of a segment (so never between hill steps
  // or between an interval's work and rest), and only if something follows.
  const lastOfSegment = !!pos.next && pos.next.segmentIndex !== segIndex;
  const warning = stage === "riding" && !pos.done && lastOfSegment && pos.phaseLeftSec <= WARN_SEC;
  const showTap = stage === "riding" && !warning && elapsed >= nextPrompt;
  const endedEarly = clock.elapsedMs / 1000 < total - 0.5;

  if (layout === null) return <div className="fixed inset-0" style={{ background: GROUND }} />;
  const { landscape } = layout;

  return (
    <div onPointerDown={onAnyTap}>
      <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: warning ? ICE : GROUND, color: warning ? GROUND : INK, ...SAFE }}>
        {stage === "ready" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <span className="text-[14px] font-medium uppercase tracking-[.2em] text-mist">{ride.name}</span>
            <span className="font-light" style={{ fontSize: "clamp(26px, 5dvh, 44px)" }}>{fmtClock(total)} · {segs.length} segments</span>
            <BigButton onClick={startRide} small>Start ride</BigButton>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {ride.playlistUrl && (
                <a href={ride.playlistUrl} target="_blank" rel="noopener noreferrer" className="flex h-[52px] items-center gap-2 rounded-full border-2 border-line px-5 text-[16px] font-medium text-ice">
                  <NoteIcon size={18} color={ICE} />Open playlist
                </a>
              )}
              <button onClick={() => setGuide(true)} className="flex h-[52px] items-center rounded-full border-2 border-line px-5 text-[16px] font-medium text-ice">Effort guide</button>
              <a href="/" className="flex h-[52px] items-center px-2 text-[14px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
            </div>
            {speed !== 1 && <span className="text-[14px] text-mist">Test mode: {speed}x clock</span>}
          </div>
        )}

        {stage === "riding" && (warning ? (
          <ChangeView v={v} landscape={landscape} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col" style={{ opacity: showTap ? 0.4 : 1 }}>
            <RideView v={v} landscape={landscape} onPause={toggle} onGuide={() => setGuide(true)} onMore={() => setMenu(true)} />
          </div>
        ))}

        {stage === "riding" && showTap && <TapBanner ignoredSec={elapsed - nextPrompt} compact />}
        {stage === "riding" && menu && clock.running && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-ground/90 p-4" onClick={() => setMenu(false)}>
            <div className={`flex gap-3 rounded-[24px] border-2 border-line bg-tile p-5 ${landscape ? "flex-row" : "w-full flex-col"}`} onClick={(e) => e.stopPropagation()}>
              <CtlButton onClick={() => { back(); setMenu(false); }}>Previous segment</CtlButton>
              <CtlButton onClick={() => { skip(); setMenu(false); }}>Skip segment</CtlButton>
              <HoldButton onHold={endRide}>Hold to end</HoldButton>
              <CtlButton onClick={() => setMenu(false)} primary>Close</CtlButton>
            </div>
          </div>
        )}
        {stage === "riding" && !clock.running && (
          <PauseOverlay fixed elapsed={elapsed} remaining={total - elapsed} onResume={toggle} onEnd={endRide} />
        )}
        {guide && <EffortGuide onClose={() => setGuide(false)} />}

        {stage === "done" && (
          <FinishScreen
            key={runId}
            workout={rideToLegacyWorkout(ride)}
            startedAt={startedAt || new Date().toISOString()}
            elapsedSec={Math.min(total, clock.elapsedMs / 1000)}
            endedEarly={endedEarly}
            segmentsCompleted={endedEarly ? segIndex : segs.length}
            onAgain={again}
            compact
            landscape={landscape}
          />
        )}
      </div>
    </div>
  );
}
