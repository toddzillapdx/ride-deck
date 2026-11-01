"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drift-proof ride clock. Elapsed time is derived from performance.now() deltas,
 * never from counting interval ticks, so a throttled tab stays accurate.
 * `speed` multiplies time for testing (?speed=10).
 */
export function useRideClock(speed = 1) {
  const accRef = useRef(0); // ms accumulated before the current run
  const startRef = useRef<number | null>(null); // performance.now() when last resumed
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);

  const read = useCallback(() => {
    const live = startRef.current === null ? 0 : (performance.now() - startRef.current) * speed;
    return accRef.current + live;
  }, [speed]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsedMs(read()), 100);
    return () => clearInterval(id);
  }, [running, read]);

  const start = useCallback(() => {
    if (startRef.current !== null) return;
    startRef.current = performance.now();
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
    if (startRef.current !== null) startRef.current = performance.now();
    setElapsedMs(accRef.current);
  }, []);

  const reset = useCallback(() => {
    accRef.current = 0;
    startRef.current = null;
    setRunning(false);
    setElapsedMs(0);
  }, []);

  return { elapsedMs, running, start, pause, seek, reset };
}
