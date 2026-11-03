"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Workout } from "@/lib/types";
import { useRideClock } from "@/lib/rideClock";
import { fmtClock } from "@/lib/format";
import { trackAt } from "@/lib/music";
import { expand, stepIndexAt } from "@/lib/pacing";
import { useLayout } from "@/lib/useLayout";
import Stage from "./Stage";
import RideScreen, { type RideView } from "./RideScreen";
import ChangeScreen from "./ChangeScreen";
import TapBanner from "./TapBanner";
import FinishScreen from "./FinishScreen";
import PhoneRide from "./PhoneRide";
import PauseOverlay from "./PauseOverlay";
import { BigButton, CtlButton, HoldButton } from "./RideControls";
import { NoteIcon } from "./Icons";

const TAP_EVERY = 600; // tap prompt cadence (seconds of ride time)
const STORE_KEY = "ridedeck-active-ride";
const STALE_MS = 6 * 3600 * 1000;

type Phase = "ready" | "riding" | "done";

export default function RidePlayer({ workout }: { workout: Workout }) {
  const layout = useLayout();
  const segs = workout.segments;
  const total = useMemo(() => segs.reduce((n, s) => n + s.durationSec, 0), [segs]);
  const starts = useMemo(() => {
    let t = 0;
    return segs.map((s) => ((t += s.durationSec), t - s.durationSec));
  }, [segs]);
  // Sprint and climb blocks become minute-by-minute steps (see lib/pacing.ts). The ride is still stored as blocks.
  const steps = useMemo(() => expand(workout), [workout]);

  // ?speed=10 runs the clock 10x for testing the warning and tap screens.
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("speed"));
    if (n > 0 && n <= 100) setSpeed(n);
  }, []);

  const clock = useRideClock(speed);
  const [phase, setPhase] = useState<Phase>("ready");
  const [menu, setMenu] = useState(false);
  const [nextPrompt, setNextPrompt] = useState(TAP_EVERY);
  const [startedAt, setStartedAt] = useState("");
  const startedAtRef = useRef("");
  const [runId, setRunId] = useState(0); // new id per ride, so each finish records once

  const elapsed = Math.min(total, clock.elapsedMs / 1000);
  const stepIdx = stepIndexAt(steps, elapsed);
  const step = steps[stepIdx];
  const index = step.segIndex; // current block
  const segElapsed = elapsed - starts[index];
  const stepLeft = step.startSec + step.durationSec - elapsed;

  // --- Keep a ride in progress across a reload (phones can discard the page while you are in the music app).
  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ rideId: workout.id, startedAt: startedAtRef.current, savedAt: Date.now(), ...clock.getState() }));
    } catch { /* storage can be unavailable; the ride still works */ }
  }, [clock, workout.id]);
  const clearActive = useCallback(() => { try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } }, []);

  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
      if (!o || o.rideId !== workout.id || typeof o.accMs !== "number") return;
      if (Date.now() - (typeof o.since === "number" ? o.since : o.savedAt) > STALE_MS) return clearActive();
      startedAtRef.current = o.startedAt || new Date().toISOString();
      setStartedAt(startedAtRef.current);
      clock.restore({ accMs: o.accMs, since: typeof o.since === "number" ? o.since : null });
      setPhase("riding");
      const live = typeof o.since === "number" ? Math.max(0, Date.now() - o.since) : 0;
      setNextPrompt((o.accMs + live) / 1000 + TAP_EVERY);
    } catch { /* ignore a corrupt entry */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Finish when the clock reaches the end.
  useEffect(() => {
    if (phase === "riding" && clock.elapsedMs / 1000 >= total) {
      clock.pause();
      clearActive();
      setPhase("done");
    }
  }, [phase, clock, total, clearActive]);

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
    if (phase !== "riding") return;
    acquire();
    const onVis = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock.current?.release().catch(() => {});
    };
  }, [phase, acquire]);

  // Any tap anywhere keeps the screen awake and resets the prompt countdown.
  const onAnyTap = () => setNextPrompt(clock.elapsedMs / 1000 + TAP_EVERY);

  // Controls
  const startRide = () => {
    const iso = new Date().toISOString();
    startedAtRef.current = iso;
    setStartedAt(iso);
    clock.start();
    setPhase("riding");
    setNextPrompt(clock.elapsedMs / 1000 + TAP_EVERY);
    persist();
  };
  const toggle = () => {
    if (clock.running) { clock.pause(); setMenu(false); } else clock.start();
    persist();
  };
  const skip = () => {
    if (index >= segs.length - 1) return endRide();
    clock.seek((starts[index] + segs[index].durationSec) * 1000);
    persist();
  };
  const back = () => {
    clock.seek((segElapsed > 3 ? starts[index] : starts[Math.max(0, index - 1)]) * 1000);
    persist();
  };
  const endRide = () => {
    clock.pause();
    clearActive();
    setPhase("done");
    setMenu(false);
  };
  const again = () => {
    setRunId((n) => n + 1);
    clock.reset();
    clearActive();
    setPhase("ready");
    setNextPrompt(TAP_EVERY);
    setMenu(false);
  };

  // Auto-close the control drawer.
  useEffect(() => {
    if (!menu || layout?.phone) return;
    const id = setTimeout(() => setMenu(false), 8000);
    return () => clearTimeout(id);
  }, [menu, layout?.phone]);

  const { now, next } = trackAt(workout, elapsed);
  const view: RideView = {
    workout, index, segElapsed, step, prevStep: steps[stepIdx - 1], nextStep: steps[stepIdx + 1],
    elapsed, total, tapIn: Math.max(0, nextPrompt - elapsed), now, next,
    onPause: toggle,
  };

  const warning = phase === "riding" && stepIdx < steps.length - 1 && stepLeft <= step.warnSec;
  const showTap = phase === "riding" && !warning && elapsed >= nextPrompt;
  const endedEarly = clock.elapsedMs / 1000 < total - 0.5;
  const finish = phase === "done" && (
    <FinishScreen
      key={runId}
      workout={workout}
      startedAt={startedAt || new Date().toISOString()}
      elapsedSec={Math.min(total, clock.elapsedMs / 1000)}
      endedEarly={endedEarly}
      segmentsCompleted={endedEarly ? index : segs.length}
      onAgain={again}
      compact={layout?.phone}
      landscape={layout?.landscape}
    />
  );

  if (layout === null) return <div className="fixed inset-0" style={{ background: "#002A33" }} />;

  if (layout.phone) {
    return (
      <div onPointerDown={onAnyTap}>
        <PhoneRide
          landscape={layout.landscape} phase={phase} running={clock.running} speed={speed} v={view}
          stepLeft={stepLeft} warning={warning} showTap={showTap} ignoredSec={elapsed - nextPrompt}
          menu={menu} setMenu={setMenu} onStart={startRide} onToggle={toggle} onSkip={skip} onBack={back} onEnd={endRide}
          finish={finish}
        />
      </div>
    );
  }

  return (
    <div onPointerDown={onAnyTap}>
      <Stage bg={warning ? "#C4DFE6" : "#002A33"}>
        {warning ? (
          <ChangeScreen index={index} count={segs.length} seg={step} next={steps[stepIdx + 1]} secondsLeft={stepLeft} elapsed={elapsed} total={total} />
        ) : (
          <>
            <div style={{ opacity: showTap ? 0.4 : 1, height: "100%" }}>
              <RideScreen v={view} />
            </div>
            {showTap && <TapBanner ignoredSec={elapsed - nextPrompt} />}
          </>
        )}

        {phase === "ready" && (
          <Overlay>
            <div className="text-[13px] font-medium uppercase tracking-[.2em] text-mist">{workout.name}</div>
            <div className="text-[34px] font-light">{fmtClock(total)} · {segs.length} segments</div>
            {workout.playlistUrl && (
              <a href={workout.playlistUrl} target="_blank" rel="noopener noreferrer" className="flex h-[60px] items-center gap-3 rounded-full border-2 border-line px-8 text-[16px] font-medium text-ice">
                <NoteIcon color="#C4DFE6" />
                Open playlist
              </a>
            )}
            <BigButton onClick={startRide}>Start ride</BigButton>
            <a href="/" className="text-[16px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
            {speed !== 1 && <div className="text-[14px] text-mist">Test mode: {speed}x clock</div>}
          </Overlay>
        )}

        {finish}

        {phase === "riding" && (
          <>
            <button
              aria-label="Controls"
              onClick={() => setMenu((m) => !m)}
              className="absolute flex items-center justify-center rounded-full border-2 border-line text-mist"
              style={{ left: 6, top: 6, width: 44, height: 44, background: "transparent", zIndex: 5 }}
            >
              ⋯
            </button>
            {menu && (
              <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-center gap-4 bg-tile" style={{ height: 96, borderBottom: "2px solid #07575B" }}>
                <CtlButton onClick={back}>Previous</CtlButton>
                <CtlButton onClick={toggle} primary>{clock.running ? "Pause" : "Resume"}</CtlButton>
                <CtlButton onClick={skip}>Skip</CtlButton>
                <HoldButton onHold={endRide}>Hold to end</HoldButton>
                <CtlButton onClick={() => setMenu(false)}>Close</CtlButton>
              </div>
            )}
            {!clock.running && <PauseOverlay elapsed={elapsed} remaining={total - elapsed} onResume={toggle} onEnd={endRide} />}
          </>
        )}
      </Stage>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-ground/90 text-center">{children}</div>
  );
}
