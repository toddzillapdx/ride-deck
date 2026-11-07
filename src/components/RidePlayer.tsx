"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPhases, phaseAt, resolveSpeed, rideDuration, rideSnapshot, segmentDuration, segmentStarts, trackAt, type Ride,
} from "@/lib/engine";
import { useRideClock } from "@/lib/rideClock";
import { fmtClock } from "@/lib/format";
import { useLayout } from "@/lib/useLayout";
import RideView, { ChangeView, Countdown321, SAFE, type RideViewData } from "./RideView";
import { FLIP_BG, FLIP_FG, REST_BG, REST_FG, WARN_SEC, WORK_BG, WORK_FG, GROUND, ICE } from "@/lib/rideTheme";
import EffortGuide from "./EffortGuide";
import TapBanner from "./TapBanner";
import { CaloriesScreen, StretchScreen, SummaryScreen, type SaveStatus } from "./PostRide";
import { patchLog, postLog, HistoryOff } from "@/lib/historyClient";
import type { RideLog } from "@/lib/history";
import PauseOverlay from "./PauseOverlay";
import { BigButton, CtlButton, HoldButton } from "./RideControls";
import { NoteIcon } from "./Icons";

const TAP_EVERY = 600; // tap prompt cadence (seconds of ride time)
const STORE_KEY = "ridedeck-active-ride";
const STALE_MS = 6 * 3600 * 1000;

type Stage = "ready" | "riding" | "stretch" | "calories" | "summary";

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
  const [final, setFinal] = useState({ elapsedSec: 0, rideSec: 0, stretchSec: 0, endedEarly: false, kcal: undefined as number | undefined });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saving");
  // History: one row per ride. Created when the structured segments end (or on an early end), updated at FINISH and when calories are saved.
  const logRef = useRef<Promise<RideLog> | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const logId = useRef("");

  const rawElapsed = clock.elapsedMs / 1000; // keeps counting into the stretch
  const elapsed = Math.min(total, rawElapsed);
  const pos = phaseAt(phases, elapsed)!;
  const segIndex = pos.phase.segmentIndex;
  const segElapsed = elapsed - starts[segIndex];

  // --- Keep a ride in progress across a reload (phones can discard the page while you are in the music app).
  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ rideId: ride.id, startedAt: startedAtRef.current, savedAt: Date.now(), logId: logId.current, ...clock.getState() }));
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
      const live = typeof o.since === "number" ? Math.max(0, Date.now() - o.since) : 0;
      const raw = (o.accMs + live) / 1000;
      if (typeof o.logId === "string" && o.logId) { logId.current = o.logId; logRef.current = Promise.resolve({ id: o.logId } as RideLog); }
      setStage(raw >= total ? "stretch" : "riding");
      setNextPrompt(raw + TAP_EVERY);
    } catch { /* ignore a corrupt entry */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // History helpers ------------------------------------------------------
  const payload = (extra: Record<string, unknown>) => ({
    rideId: ride.id, rideName: ride.name, startedAt: startedAtRef.current || new Date().toISOString(),
    plannedSec: Math.round(total), segments: rideSnapshot(ride), ...extra,
  });
  const note = (e: unknown) => setSaveStatus(e instanceof HistoryOff ? "off" : { error: (e as Error).message });
  const startLog = (extra: Record<string, unknown>) => {
    setSaveStatus("saving");
    const p = postLog(payload(extra)).then((l) => { logId.current = l.id; setSaveStatus("ok"); persist(); return l; });
    p.catch(note);
    logRef.current = p;
  };
  /** Patch the ride's row (after any earlier patch). If the row was never created, create it with everything we know. */
  const updateLog = (patch: { kcal?: number; elapsedSec?: number; stretchSec?: number }, full: Record<string, unknown>) => {
    chain.current = chain.current.then(async () => {
      const row = await (logRef.current ?? Promise.reject(new Error("no row"))).catch(() => null);
      try {
        if (row) await patchLog(row.id, patch);
        else { const l = await postLog(payload(full)); logId.current = l.id; logRef.current = Promise.resolve(l); }
        setSaveStatus("ok");
      } catch (e) { note(e); }
    });
  };

  // When the structured segments end the ride does not stop: the clock keeps counting into the stretch.
  useEffect(() => {
    if (stage === "riding" && rawElapsed >= total) {
      setStage("stretch");
      startLog({ elapsedSec: Math.round(total), rideSec: Math.round(total), stretchSec: 0, segmentsCompleted: segs.length });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, rawElapsed, total]);

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
    if (stage !== "riding" && stage !== "stretch") return;
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
  /** Early end (the hold-to-confirm End ride): straight to Calories, flagged endedEarly. */
  const endRide = () => {
    clock.pause();
    clearActive();
    const sec = Math.round(Math.min(total, clock.elapsedMs / 1000));
    setFinal({ elapsedSec: sec, rideSec: sec, stretchSec: 0, endedEarly: true, kcal: undefined });
    startLog({ elapsedSec: sec, rideSec: sec, stretchSec: 0, segmentsCompleted: segIndex, endedEarly: true });
    setStage("calories");
    setMenu(false);
  };
  /** FINISH RIDE on the stretch screen: stop the clock, record totals, ask for calories. */
  const finishRide = () => {
    clock.pause();
    clearActive();
    const all = Math.round(clock.elapsedMs / 1000);
    const stretchSec = Math.max(0, all - Math.round(total));
    setFinal({ elapsedSec: all, rideSec: Math.round(total), stretchSec, endedEarly: false, kcal: undefined });
    updateLog({ elapsedSec: all, stretchSec }, { elapsedSec: all, rideSec: Math.round(total), stretchSec, segmentsCompleted: segs.length });
    setStage("calories");
  };
  const fullFor = (f: typeof final, kcal?: number) => ({
    ...(kcal === undefined ? {} : { kcal }), elapsedSec: f.elapsedSec, rideSec: f.rideSec, stretchSec: f.stretchSec,
    segmentsCompleted: f.endedEarly ? segIndex : segs.length, ...(f.endedEarly ? { endedEarly: true } : {}),
  });
  const saveKcal = (kcal: number) => {
    setFinal((f) => ({ ...f, kcal }));
    updateLog({ kcal }, fullFor(final, kcal));
    setStage("summary");
  };
  const retrySave = () => updateLog({ ...(final.kcal === undefined ? {} : { kcal: final.kcal }), elapsedSec: final.elapsedSec, stretchSec: final.stretchSec }, fullFor(final, final.kcal));
  const skip = () => {
    if (segIndex >= segs.length - 1) { clock.seek(total * 1000); persist(); return; } // last segment: on to the stretch
    clock.seek((starts[segIndex] + durations[segIndex]) * 1000);
    persist();
  };
  const back = () => {
    clock.seek((segElapsed > 3 ? starts[segIndex] : starts[Math.max(0, segIndex - 1)]) * 1000);
    persist();
  };
  const again = () => {
    clock.reset();
    clearActive();
    logRef.current = null;
    logId.current = "";
    chain.current = Promise.resolve();
    setSaveStatus("saving");
    setStage("ready");
    setNextPrompt(TAP_EVERY);
    setMenu(false);
  };

  const { now, next } = trackAt(ride, elapsed);
  const v: RideViewData = {
    ride, phases, idx: pos.index, segStarts: starts, segDurations: durations, elapsed, total,
    phaseLeft: pos.phaseLeftSec, tapIn: Math.max(0, nextPrompt - rawElapsed), now, next,
  };

  // The flip: only in the last WARN_SEC of the LAST phase of a segment (so never between hill steps
  // or between an interval's work and rest), and only if something follows.
  const lastOfSegment = !!pos.next && pos.next.segmentIndex !== segIndex;
  const warning = stage === "riding" && !pos.done && lastOfSegment && pos.phaseLeftSec <= WARN_SEC;
  const showTap = (stage === "riding" || stage === "stretch") && !warning && rawElapsed >= nextPrompt;

  const inInterval = stage === "riding" && !warning && (pos.phase.kind === "work" || pos.phase.kind === "rest");
  const bg = warning ? FLIP_BG : inInterval ? (pos.phase.kind === "work" ? WORK_BG : REST_BG) : REST_BG;
  const fgc = warning ? FLIP_FG : inInterval ? (pos.phase.kind === "work" ? WORK_FG : REST_FG) : REST_FG;

  if (layout === null) return <div className="fixed inset-0" style={{ background: GROUND }} />;
  const { landscape } = layout;

  return (
    <div onPointerDown={onAnyTap}>
      <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: bg, color: fgc, ...SAFE }}>
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

        {inInterval && !showTap && !menu && clock.running && !guide && <Countdown321 phase={pos.phase} left={pos.phaseLeftSec} />}
        {showTap && <TapBanner ignoredSec={rawElapsed - nextPrompt} compact />}
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

        {stage === "stretch" && <StretchScreen ride={ride} stretchSec={Math.max(0, rawElapsed - total)} landscape={landscape} onFinish={finishRide} />}
        {stage === "calories" && <CaloriesScreen endedEarly={final.endedEarly} landscape={landscape} onSave={saveKcal} onSkip={() => setStage("summary")} />}
        {stage === "summary" && (
          <SummaryScreen name={ride.name} endedEarly={final.endedEarly} totalSec={final.elapsedSec} rideSec={final.rideSec} stretchSec={final.stretchSec}
            kcal={final.kcal} status={saveStatus} onRetry={retrySave} onAgain={again} />
        )}
      </div>
    </div>
  );
}
