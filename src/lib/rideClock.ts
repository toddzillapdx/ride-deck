"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** What is needed to rebuild the clock after a reload. `since` is the epoch ms of the last resume, or null while paused. */
export interface ClockState {
  accMs: number;
  since: number | null;
}

/**
 * Ride clock. Elapsed time is derived from timestamps, never from counting interval ticks, so a
 * throttled or suspended tab stays accurate. It uses the wall clock (Date.now), not performance.now:
 * on phones performance.now can stop while the page is suspended (screen lock, switching to the music
 * app), which would make the ride lag. `speed` multiplies time for testing (?speed=10).
 */
export function useRideClock(speed = 1) {
  const accRef = useRef(0); // ms accumulated before the current run
  const startRef = useRef<number | null>(null); // Date.now() when last resumed
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);

  const read = useCallback(() => {
    const live = startRef.current === null ? 0 : Math.max(0, Date.now() - startRef.current) * speed;
    return accRef.current + live;
  }, [speed]);

  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsedMs(read());
    const id = setInterval(tick, 100);
    // Catch up the moment the page is shown again, instead of waiting for the next tick.
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [running, read]);

  const start = useCallback(() => {
    if (startRef.current !== null) return;
    startRef.current = Date.now();
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    if (startRef.current === null) return;
    accRef.current = read();
    startRef.current = null;
    setRunning(false);
    setElapsedMs(accRef.current);
  }, [read]);

  /** Jump to an absolute elapsed time (skip / previous segment). */
  const seek = useCallback((ms: number) => {
    accRef.current = Math.max(0, ms);
    if (startRef.current !== null) startRef.current = Date.now();
    setElapsedMs(accRef.current);
  }, []);

  const reset = useCallback(() => {
    accRef.current = 0;
    startRef.current = null;
    setRunning(false);
    setElapsedMs(0);
  }, []);

  const getState = useCallback((): ClockState => ({ accMs: accRef.current, since: startRef.current }), []);

  const restore = useCallback((s: ClockState) => {
    accRef.current = Math.max(0, s.accMs);
    startRef.current = s.since;
    setRunning(s.since !== null);
    setElapsedMs(read());
  }, [read]);

  return { elapsedMs, running, start, pause, seek, reset, getState, restore };
}
