"use client";
import { useEffect, useState } from "react";
import { fmtClock } from "@/lib/format";
import { stretchesFor, type Ride } from "@/lib/engine";
import { KCAL_MAX } from "@/lib/history";
import { SAFE } from "./RideView";

/** Everything after the structured segments: stretch, FINISH RIDE, calories, summary. Same responsive rules as the ride screen: no scroll, nothing under 14px. */
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="fixed inset-0 z-20 flex flex-col overflow-hidden bg-ground text-ink" style={SAFE}>{children}</div>
);

/* ---------------------------------------------------------------- stretch */
export function StretchScreen({ ride, stretchSec, landscape, onFinish }: { ride: Ride; stretchSec: number; landscape: boolean; onFinish: () => void }) {
  const list = stretchesFor(ride);
  // Optional per-stretch timer: tap to start, visual only.
  const [active, setActive] = useState<{ i: number; endsAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  useEffect(() => {
    if (active && now >= active.endsAt) setActive(null);
  }, [now, active]);

  const clock = (
    <div className="flex flex-col items-center">
      <span className="text-[14px] font-medium uppercase tracking-[.2em] text-ice">Stretch</span>
      <span className="num font-extralight" style={{ fontSize: landscape ? "clamp(64px, 28dvh, 220px)" : "clamp(72px, 14dvh, 200px)" }}>{fmtClock(stretchSec)}</span>
      <span className="text-[16px] font-light text-mist">Music keeps playing. Take your time.</span>
    </div>
  );
  const finish = (
    <button onClick={onFinish} className="h-[68px] w-full rounded-full bg-ice text-[20px] font-medium uppercase tracking-[.1em] text-ground">Finish ride</button>
  );
  const rows = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1">
      {list.map((s, i) => {
        const on = active?.i === i;
        const left = on ? Math.max(0, Math.ceil((active!.endsAt - now) / 1000)) : s.holdSec;
        return (
          <button key={i} onClick={() => { setNow(Date.now()); setActive(on ? null : { i, endsAt: Date.now() + s.holdSec * 1000 }); }}
            className={`flex min-h-[52px] flex-none items-center justify-between gap-3 rounded-[18px] border-2 px-4 text-left ${on ? "border-ice bg-ice text-ground" : "border-line bg-tile text-ink"}`}>
            <span className="text-[18px] font-medium">{s.name}</span>
            <span className="num text-[20px] font-light">{on ? fmtClock(left) : `${s.holdSec}s`}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Frame>
      {landscape ? (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex w-[44%] flex-none flex-col items-center justify-between gap-3">{clock}{finish}</div>
          {rows}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {clock}
          {rows}
          {finish}
        </div>
      )}
    </Frame>
  );
}

/* --------------------------------------------------------------- calories */
export function CaloriesScreen({ endedEarly, landscape, onSave, onSkip }: { endedEarly: boolean; landscape: boolean; onSave: (kcal: number) => void; onSkip: () => void }) {
  const [digits, setDigits] = useState("");
  const press = (d: string) => setDigits((cur) => (Number(cur + d) > KCAL_MAX || cur.length >= 4 ? cur : cur === "0" ? d : cur + d));
  const value = digits === "" ? null : Number(digits);

  const display = (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[14px] font-medium uppercase tracking-[.2em] text-ice">{endedEarly ? "Ride ended early" : "Ride complete"}</span>
      <span className="text-[18px] font-light text-mist">Calories from the bike (kcal)</span>
      <span className="num font-light" style={{ fontSize: landscape ? "clamp(56px, 22dvh, 140px)" : "clamp(64px, 12dvh, 140px)", color: value === null ? "#07575B" : "#F4F5F7" }}>{value === null ? "—" : value}</span>
    </div>
  );
  const save = (
    <div className="flex w-full flex-col items-center gap-2">
      <button disabled={value === null} onClick={() => value !== null && onSave(value)}
        className="h-[68px] w-full rounded-full bg-ice text-[20px] font-medium uppercase tracking-[.1em] text-ground disabled:opacity-35">Save</button>
      <button onClick={onSkip} className="h-[44px] px-6 text-[16px] font-medium uppercase tracking-[.16em] text-mist underline underline-offset-4">Skip</button>
    </div>
  );
  const keys = (
    <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-4 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
        <button key={k} onClick={() => press(k)} className="rounded-[18px] border-2 border-line bg-tile text-[30px] font-light active:bg-line">{k}</button>
      ))}
      <button onClick={() => setDigits((d) => d.slice(0, -1))} aria-label="Delete" className="rounded-[18px] border-2 border-line bg-tile text-[26px] font-light active:bg-line">⌫</button>
      <button onClick={() => press("0")} className="rounded-[18px] border-2 border-line bg-tile text-[30px] font-light active:bg-line">0</button>
      <button onClick={() => setDigits("")} className="rounded-[18px] border-2 border-line bg-tile text-[16px] font-medium uppercase tracking-[.1em] text-mist active:bg-line">Clear</button>
    </div>
  );

  return (
    <Frame>
      {landscape ? (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex w-[46%] flex-none flex-col items-center justify-between">{display}{save}</div>
          {keys}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">{display}{keys}{save}</div>
      )}
    </Frame>
  );
}

/* ---------------------------------------------------------------- summary */
export type SaveStatus = "saving" | "ok" | "off" | { error: string };

export function SummaryScreen({ name, endedEarly, totalSec, rideSec, stretchSec, kcal, status, onRetry, onAgain }: {
  name: string; endedEarly: boolean; totalSec: number; rideSec: number; stretchSec: number; kcal?: number; status: SaveStatus; onRetry: () => void; onAgain: () => void;
}) {
  const msg = status === "saving" ? "Saving to history…" : status === "ok" ? "Saved to history" : status === "off" ? "Not saved: Airtable isn't connected" : `Not saved: ${status.error}`;
  return (
    <Frame>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="text-[14px] font-medium uppercase tracking-[.2em] text-ice">{endedEarly ? "Ride ended early" : "Ride complete"}</span>
        <span className="text-[24px] font-light">{name}</span>
        <div className="flex w-full max-w-[560px] gap-3">
          <Stat label="Total time" value={fmtClock(totalSec)} sub={stretchSec > 0 ? `ride ${fmtClock(rideSec)} + stretch ${fmtClock(stretchSec)}` : `ride ${fmtClock(rideSec)}`} />
          <Stat label="Calories" value={kcal === undefined ? "—" : String(kcal)} sub={kcal === undefined ? "not recorded" : "kcal"} />
        </div>
        <span className={`text-[14px] ${status === "ok" || status === "saving" ? "text-mist" : "text-ice"}`}>
          {msg}
          {typeof status === "object" && <button onClick={onRetry} className="ml-3 underline underline-offset-4">Retry</button>}
        </span>
        <div className="flex w-full max-w-[560px] flex-wrap items-center justify-center gap-3">
          <button onClick={onAgain} className="h-[60px] flex-1 rounded-full bg-ice px-8 text-[18px] font-medium text-ground">Ride again</button>
          <a href="/" className="flex h-[60px] flex-1 items-center justify-center rounded-full border-2 border-line px-8 text-[18px] font-medium text-ink">Library</a>
          <a href="/history" className="flex h-[52px] items-center px-4 text-[14px] font-medium uppercase tracking-[.16em] text-mist">History</a>
        </div>
      </div>
    </Frame>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-[20px] border-2 border-line bg-tile px-3 py-3">
      <span className="text-[14px] font-medium uppercase tracking-[.16em] text-mist">{label}</span>
      <span className="num text-[44px] font-light">{value}</span>
      <span className="text-[14px] font-light text-mist">{sub}</span>
    </div>
  );
}
