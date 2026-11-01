"use client";
import { useEffect, useRef, useState } from "react";
import type { Workout } from "@/lib/types";
import { snapshot, type RideLog } from "@/lib/history";
import { fmtClock } from "@/lib/format";
import { totalSeconds } from "@/lib/presets";
import TargetsChart from "./TargetsChart";
import KcalField from "./KcalField";

type Saved = { state: "saving" } | { state: "ok"; log: RideLog } | { state: "off" } | { state: "error"; message: string };

/** Ride summary. Records the ride to history as soon as it opens; kcal is added afterwards. */
export default function FinishScreen({ workout, startedAt, elapsedSec, endedEarly, segmentsCompleted, onAgain }: {
  workout: Workout; startedAt: string; elapsedSec: number; endedEarly: boolean; segmentsCompleted: number; onAgain: () => void;
}) {
  const [saved, setSaved] = useState<Saved>({ state: "saving" });
  const posted = useRef(false);

  const payload = (kcal?: number | null) => ({
    rideId: workout.id, rideName: workout.name, startedAt,
    elapsedSec: Math.round(elapsedSec), plannedSec: totalSeconds(workout),
    segmentsCompleted, segments: snapshot(workout),
    ...(kcal === null || kcal === undefined ? {} : { kcal }),
  });

  async function create(kcal?: number | null): Promise<RideLog> {
    const res = await fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(kcal)) });
    const body = await res.json().catch(() => ({}));
    if (res.status === 503) { setSaved({ state: "off" }); throw new Error("History isn't connected to Airtable"); }
    if (!res.ok) { const m = body.error ?? `Couldn't save (${res.status})`; setSaved({ state: "error", message: m }); throw new Error(m); }
    setSaved({ state: "ok", log: body as RideLog });
    return body as RideLog;
  }

  useEffect(() => {
    if (posted.current) return; // one record per finished ride, even under Strict Mode
    posted.current = true;
    create().catch(() => { /* surfaced via state */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveKcal(kcal: number | null) {
    if (saved.state === "ok") {
      const res = await fetch(`/api/history/${saved.log.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kcal }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Couldn't save (${res.status})`);
      setSaved({ state: "ok", log: body as RideLog });
    } else {
      await create(kcal); // the first save failed; this retries with the calories included
    }
  }

  const status =
    saved.state === "saving" ? "Saving to history…"
    : saved.state === "ok" ? "Saved to history"
    : saved.state === "off" ? "Not saved: Airtable isn't connected"
    : `Not saved: ${saved.message}`;

  return (
    <div className="absolute inset-0 z-20 flex flex-col gap-6 bg-ground text-ink" style={{ padding: "36px 56px 40px", boxSizing: "border-box" }}>
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium uppercase tracking-[.2em] text-mist">{endedEarly ? "Ride ended early" : "Ride complete"}</span>
          <span className="text-[34px] font-light leading-none">{workout.name}</span>
        </div>
        <span className={`text-[14px] ${saved.state === "ok" ? "text-mist" : saved.state === "saving" ? "text-mist" : "text-ice"}`}>
          {status}
          {saved.state === "error" && <button onClick={() => { posted.current = true; setSaved({ state: "saving" }); create().catch(() => {}); }} className="ml-3 underline underline-offset-4">Retry</button>}
        </span>
      </div>

      <div className="flex gap-6">
        <Stat label="Time" value={fmtClock(elapsedSec)} sub={`of ${fmtClock(totalSeconds(workout))}`} />
        <Stat label="Segments" value={`${segmentsCompleted}`} sub={`of ${workout.segments.length}`} />
        <div className="flex flex-1 flex-col justify-center rounded-[28px] border-2 border-line bg-tile px-8 py-5">
          <KcalField value={saved.state === "ok" ? saved.log.kcal : undefined} save={saveKcal} />
        </div>
      </div>

      <div className="min-h-0 flex-1 rounded-[28px] bg-tile px-8 py-5">
        <TargetsChart segments={snapshot(workout)} reached={segmentsCompleted} panelHeight={128} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <a href="/" className="flex h-[60px] items-center rounded-full border-2 border-line px-7 text-[16px] font-medium text-ink">Library</a>
          <a href="/history" className="flex h-[60px] items-center rounded-full border-2 border-line px-7 text-[16px] font-medium text-ink">History</a>
        </div>
        <button onClick={onAgain} className="h-[60px] rounded-full bg-ice px-10 text-[16px] font-medium text-ground">Ride again</button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex w-[250px] flex-none flex-col justify-center gap-1 rounded-[28px] border-2 border-line bg-tile px-8 py-5">
      <span className="text-[13px] font-medium uppercase tracking-[.18em] text-mist">{label}</span>
      <span className="num text-[52px] font-light" style={{ letterSpacing: "-.01em" }}>{value}</span>
      <span className="text-[14px] font-light text-mist">{sub}</span>
    </div>
  );
}
