"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Stage from "./Stage";
import TargetsChart from "./TargetsChart";
import KcalField from "./KcalField";
import { PRESETS } from "@/lib/presets";
import { totals, type RideLog } from "@/lib/history";
import { fmtClock } from "@/lib/format";
import type { Workout } from "@/lib/types";

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
};
const hours = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : `${Math.round(sec / 60)}m`);
const lab = "text-[12px] font-medium uppercase tracking-[.2em] text-mist";

export default function HistoryView() {
  const [logs, setLogs] = useState<RideLog[]>([]);
  const [rides, setRides] = useState<Workout[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "off" | "error">("loading");
  const [detail, setDetail] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, r] = await Promise.all([fetch("/api/history", { cache: "no-store" }), fetch("/api/rides", { cache: "no-store" })]);
      const hb = await h.json();
      const rb = await r.json().catch(() => ({ rides: [] }));
      setRides(rb.rides ?? []);
      if (!hb.configured) return setStatus("off");
      if (!h.ok) { setDetail(hb.error ?? ""); return setStatus("error"); }
      setLogs(hb.logs);
      setSelected((s) => s ?? hb.logs[0]?.id ?? null);
      setStatus("ok");
    } catch (e) { setDetail((e as Error).message); setStatus("error"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const t = useMemo(() => totals(logs), [logs]);
  const sel = logs.find((l) => l.id === selected);
  const rideExists = (id: string) => PRESETS.some((p) => p.id === id) || rides.some((r) => r.id === id);

  async function saveKcal(log: RideLog, kcal: number | null) {
    const res = await fetch(`/api/history/${log.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kcal }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Couldn't save (${res.status})`);
    setLogs((ls) => ls.map((l) => (l.id === log.id ? (body as RideLog) : l)));
  }

  async function remove(log: RideLog) {
    if (!window.confirm(`Delete this ride from history?\n${log.rideName} · ${when(log.startedAt)}`)) return;
    const res = await fetch(`/api/history/${log.id}`, { method: "DELETE" });
    if (!res.ok) return window.alert((await res.json().catch(() => ({}))).error ?? "Delete failed");
    setLogs((ls) => { const next = ls.filter((l) => l.id !== log.id); setSelected(next[0]?.id ?? null); return next; });
  }

  return (
    <Stage bg="#002A33">
      <div className="flex h-full flex-col gap-5 bg-ground text-ink" style={{ padding: "32px 56px", boxSizing: "border-box" }}>
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1">
            <a href="/" className="text-[13px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
            <span className="text-[34px] font-light uppercase leading-none" style={{ letterSpacing: ".02em" }}>History</span>
          </div>
          {status === "ok" && (
            <div className="flex gap-8">
              <Total label="Rides" value={String(t.rides)} />
              <Total label="Time" value={hours(t.seconds)} />
              <Total label="Kcal" value={t.kcal.toLocaleString()} />
            </div>
          )}
        </div>

        {status !== "ok" ? (
          <div className="flex flex-1 items-center justify-center rounded-[20px] border-2 border-dashed border-line text-center text-[18px] text-mist">
            {status === "loading" ? "Loading…" : status === "off" ? "History needs Airtable. Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in Vercel." : `Couldn't load history${detail ? `: ${detail.slice(0, 120)}` : ""}`}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-[20px] border-2 border-dashed border-line text-center text-[18px] text-mist">
            No rides yet. Finish a ride and it shows up here.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 gap-8">
            <div className="flex w-[440px] flex-none flex-col gap-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
              {logs.map((l) => (
                <button key={l.id} onClick={() => setSelected(l.id)}
                  className={`flex flex-none items-center gap-4 rounded-[16px] border-2 bg-tile px-5 py-4 text-left ${l.id === selected ? "border-ice" : "border-line"}`}>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[17px] font-normal">{l.rideName}</span>
                    <span className="text-[13px] font-light text-mist">{when(l.startedAt)} · {fmtClock(l.elapsedSec)}{l.segmentsCompleted < l.segmentsTotal ? " · ended early" : ""}</span>
                  </div>
                  <div className="flex flex-none flex-col items-end">
                    <span className="num text-[26px] font-light" style={{ letterSpacing: "-.01em" }}>{l.kcal ?? "—"}</span>
                    <span className="text-[12px] font-medium uppercase tracking-[.16em] text-mist">kcal</span>
                  </div>
                </button>
              ))}
            </div>

            {sel && (
              <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                <div className="flex flex-col gap-1">
                  <span className={lab}>{when(sel.startedAt)}</span>
                  <span className="text-[28px] font-light leading-tight">{sel.rideName}</span>
                  <span className="text-[14px] font-light text-mist">
                    {fmtClock(sel.elapsedSec)} of {fmtClock(sel.plannedSec)} · {sel.segmentsCompleted} of {sel.segmentsTotal} segments
                  </span>
                </div>
                <div className="rounded-[20px] border-2 border-line bg-tile px-6 py-4">
                  <KcalField key={sel.id} value={sel.kcal} save={(k) => saveKcal(sel, k)} />
                </div>
                <div className="rounded-[20px] bg-tile px-5 py-4">
                  <TargetsChart segments={sel.segments} reached={sel.segmentsCompleted} panelHeight={84} />
                </div>
                <div className="flex gap-3">
                  {rideExists(sel.rideId)
                    ? <a href={`/ride/${sel.rideId}`} className="flex h-[52px] items-center rounded-full bg-ice px-7 text-[15px] font-medium text-ground">Ride again</a>
                    : <span className="flex h-[52px] items-center rounded-full border-2 border-line px-7 text-[14px] text-mist">Original ride was deleted</span>}
                  <button onClick={() => remove(sel)} className="h-[52px] rounded-full border-2 border-line px-6 text-[14px] text-mist">Delete entry</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Stage>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={lab}>{label}</span>
      <span className="num text-[30px] font-light" style={{ letterSpacing: "-.01em" }}>{value}</span>
    </div>
  );
}
