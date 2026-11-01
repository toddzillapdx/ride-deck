"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Workout } from "@/lib/types";
import { useRideClock } from "@/lib/rideClock";
import { fmtClock } from "@/lib/format";
import { trackAt } from "@/lib/music";
import Stage from "./Stage";
import RideScreen, { type RideView } from "./RideScreen";
import ChangeScreen from "./ChangeScreen";
import TapBanner from "./TapBanner";

const WARN_SEC = 10; // change screen window
const TAP_EVERY = 600; // tap prompt cadence (seconds of ride time)

type Phase = "ready" | "riding" | "done";

export default function RidePlayer({ workout }: { workout: Workout }) {
  const segs = workout.segments;
  const total = useMemo(() => segs.reduce((n, s) => n + s.durationSec, 0), [segs]);
  const starts = useMemo(() => {
    let t = 0;
    return segs.map((s) => ((t += s.durationSec), t - s.durationSec));
  }, [segs]);

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

  const elapsed = Math.min(total, clock.elapsedMs / 1000);
  const index = Math.max(0, segs.findIndex((_, i) => elapsed < starts[i] + segs[i].durationSec));
  const segElapsed = elapsed - starts[index];
  const segLeft = segs[index].durationSec - segElapsed;

  // Finish when the clock reaches the end.
  useEffect(() => {
    if (phase === "riding" && clock.elapsedMs / 1000 >= total) {
      clock.pause();
      setPhase("done");
    }
  }, [phase, clock, total]);

  // Screen Wake Lock: best effort, fail silently. The tap prompt is the real mechanism.
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

  // Any tap anywhere keeps the tablet awake and resets the prompt countdown.
  const onAnyTap = () => setNextPrompt(clock.elapsedMs / 1000 + TAP_EVERY);

  // Controls
  const startRide = () => {
    clock.start();
    setPhase("riding");
    setNextPrompt(clock.elapsedMs / 1000 + TAP_EVERY);
  };
  const toggle = () => (clock.running ? clock.pause() : clock.start());
  const skip = () => {
    if (index >= segs.length - 1) return endRide();
    clock.seek((starts[index] + segs[index].durationSec) * 1000);
  };
  const back = () => clock.seek((segElapsed > 3 ? starts[index] : starts[Math.max(0, index - 1)]) * 1000);
  const endRide = () => {
    clock.pause();
    setPhase("done");
    setMenu(false);
  };
  const again = () => {
    clock.reset();
    setPhase("ready");
    setNextPrompt(TAP_EVERY);
    setMenu(false);
  };

  // Auto-close the control drawer.
  useEffect(() => {
    if (!menu) return;
    const id = setTimeout(() => setMenu(false), 8000);
    return () => clearTimeout(id);
  }, [menu]);

  const { now, next } = trackAt(workout, elapsed);
  const view: RideView = { workout, index, segElapsed, elapsed, total, tapIn: Math.max(0, nextPrompt - elapsed), now, next };

  const warning = phase === "riding" && index < segs.length - 1 && segLeft <= WARN_SEC;
  const showTap = phase === "riding" && !warning && elapsed >= nextPrompt;

  return (
    <div onPointerDown={onAnyTap}>
      <Stage bg={warning ? "#C4DFE6" : "#002A33"}>
        {warning ? (
          <ChangeScreen index={index} count={segs.length} seg={segs[index]} next={segs[index + 1]} secondsLeft={segLeft} elapsed={elapsed} total={total} />
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
            <BigButton onClick={startRide}>Start ride</BigButton>
            <a href="/" className="text-[16px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
            {speed !== 1 && <div className="text-[14px] text-mist">Test mode: {speed}x clock</div>}
          </Overlay>
        )}

        {phase === "done" && (
          <Overlay>
            <div className="text-[13px] font-medium uppercase tracking-[.2em] text-mist">Ride complete</div>
            <div className="num text-[88px] font-extralight">{fmtClock(Math.min(total, clock.elapsedMs / 1000))}</div>
            <div className="text-[20px] text-mist">of {fmtClock(total)} · {workout.name}</div>
            <BigButton onClick={again}>Ride again</BigButton>
            <a href="/" className="text-[16px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
          </Overlay>
        )}

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
            {!clock.running && !menu && (
              <div className="absolute left-1/2 top-[110px] -translate-x-1/2 rounded-full bg-ice px-8 py-3 text-[18px] font-medium uppercase tracking-[.2em] text-ground" style={{ zIndex: 5 }}>
                Paused
              </div>
            )}
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

function BigButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="h-[84px] rounded-full bg-ice px-16 text-[22px] font-medium uppercase tracking-[.1em] text-ground">
      {children}
    </button>
  );
}

function CtlButton({ onClick, children, primary }: { onClick: () => void; children: React.ReactNode; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`h-[60px] rounded-full px-8 text-[16px] font-medium ${primary ? "bg-ice text-ground" : "border-2 border-line text-ink"}`}
    >
      {children}
    </button>
  );
}

/** Press and hold 1.5s to confirm, so it can't be hit by accident. */
function HoldButton({ onHold, children }: { onHold: () => void; children: React.ReactNode }) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const stop = () => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
    setHolding(false);
  };
  return (
    <button
      onPointerDown={() => {
        setHolding(true);
        t.current = setTimeout(() => { stop(); onHold(); }, 1500);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className={`h-[60px] rounded-full border-2 px-8 text-[16px] font-medium ${holding ? "border-ice bg-ice text-ground" : "border-line text-ink"}`}
    >
      {holding ? "Keep holding…" : children}
    </button>
  );
}
