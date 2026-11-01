"use client";
import { useMemo, useState } from "react";
import Stage from "./Stage";
import { fmtClock } from "@/lib/format";
import {
  TYPE_OPTIONS, draftSeconds, intervals, move, newSegment, toWorkout, uid,
  type SegDraft, type WorkoutDraft,
} from "@/lib/builder";
import type { SegmentType } from "@/lib/types";

export type BuilderMode = { kind: "new" } | { kind: "edit"; id: string };

const field = "h-11 rounded-[12px] border-2 border-line bg-ground px-3 text-[15px] font-normal text-ink outline-none focus:border-ice";
const label = "text-[11px] font-medium uppercase tracking-[.18em] text-mist";

export default function Builder({ initial, mode }: { initial: WorkoutDraft; mode: BuilderMode }) {
  const [d, setD] = useState<WorkoutDraft>(initial);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [iv, setIv] = useState({ work: "60", rest: "90", rounds: "5" });
  const total = useMemo(() => draftSeconds(d), [d]);

  const set = (patch: Partial<WorkoutDraft>) => setD((x) => ({ ...x, ...patch }));
  const setSeg = (i: number, patch: Partial<SegDraft>) =>
    setD((x) => ({ ...x, segments: x.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const add = (...segs: SegDraft[]) => setD((x) => ({ ...x, segments: [...x.segments, ...segs] }));

  const addIntervals = () => {
    const w = Math.round(Number(iv.work)), r = Math.round(Number(iv.rest)), n = Math.round(Number(iv.rounds));
    if (!(w > 0 && r > 0 && n > 0 && n <= 30)) return setMsg({ text: "Intervals: work and rest in seconds, 1 to 30 rounds" });
    setMsg(null);
    add(...intervals(w, r, n));
  };

  const save = async () => {
    setMsg(null);
    let workout;
    try { workout = toWorkout(d, mode.kind === "edit" ? mode.id : ""); }
    catch (e) { return setMsg({ text: (e as Error).message }); }
    setBusy(true);
    try {
      const res = await fetch(mode.kind === "edit" ? `/api/rides/${mode.id}` : "/api/rides", {
        method: mode.kind === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workout),
      });
      if (res.ok) { window.location.href = "/"; return; }
      const body = await res.json().catch(() => ({}));
      setMsg({ text: res.status === 503 ? "Airtable isn't connected yet, so rides can't be saved. Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in Vercel." : body.error ?? `Save failed (${res.status})` });
    } catch (e) {
      setMsg({ text: (e as Error).message });
    }
    setBusy(false);
  };

  const remove = async () => {
    if (mode.kind !== "edit" || !window.confirm(`Delete "${d.name || "this ride"}"? This can't be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/rides/${mode.id}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/";
    else { setBusy(false); setMsg({ text: (await res.json().catch(() => ({}))).error ?? "Delete failed" }); }
  };

  return (
    <Stage bg="#002A33">
      <div className="flex h-full gap-8 bg-ground text-ink" style={{ padding: "32px 56px 32px", boxSizing: "border-box" }}>
        {/* left: details, templates, save */}
        <div className="flex w-[330px] flex-none flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" style={{ scrollbarWidth: "none" }}>
          <div className="flex flex-col gap-1">
            <a href="/" className="text-[13px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
            <span className="text-[30px] font-light uppercase leading-tight" style={{ letterSpacing: ".02em" }}>
              {mode.kind === "edit" ? "Edit ride" : "New ride"}
            </span>
          </div>

          <Labeled text="Name"><input className={field} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="30 min · Hills and sprints" /></Labeled>
          <div className="flex gap-3">
            <Labeled text="Genre"><input className={`${field} w-full`} value={d.genre} onChange={(e) => set({ genre: e.target.value })} placeholder="Rock" /></Labeled>
            <Labeled text="Vibe"><input className={`${field} w-full`} value={d.vibe} onChange={(e) => set({ vibe: e.target.value })} placeholder="Classic" /></Labeled>
          </div>
          <Labeled text="Playlist link"><input className={field} value={d.playlistUrl} onChange={(e) => set({ playlistUrl: e.target.value })} placeholder="https://music.amazon.com/…" inputMode="url" /></Labeled>

          <div className="flex flex-col gap-2">
            <span className={label}>Add segment</span>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button key={t.value} onClick={() => add(newSegment(t.value))} className="h-11 rounded-full border-2 border-line px-4 text-[14px] text-ink">+ {t.label}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-[16px] bg-tile p-3">
            <span className={label}>Intervals</span>
            <div className="flex items-end gap-2">
              <Mini text="Work s" v={iv.work} on={(v) => setIv({ ...iv, work: v })} />
              <Mini text="Rest s" v={iv.rest} on={(v) => setIv({ ...iv, rest: v })} />
              <Mini text="Rounds" v={iv.rounds} on={(v) => setIv({ ...iv, rounds: v })} />
              <button onClick={addIntervals} className="h-11 flex-1 rounded-full bg-ice text-[14px] font-medium text-ground">Add</button>
            </div>
          </div>

          </div>

          <div className="flex flex-none flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className={label}>{d.segments.length} segments</span>
              <span className="text-[26px] font-light">{fmtClock(total)}</span>
            </div>
            {msg && <p className={`text-[14px] leading-snug ${msg.ok ? "text-mist" : "text-ice"}`}>{msg.text}</p>}
            <button onClick={save} disabled={busy} className="h-[60px] rounded-full bg-ice text-[17px] font-medium text-ground disabled:opacity-50">
              {busy ? "Saving…" : mode.kind === "edit" ? "Save changes" : "Save ride"}
            </button>
            {mode.kind === "edit" && (
              <button onClick={remove} disabled={busy} className="h-11 rounded-full border-2 border-line text-[14px] text-mist">Delete ride</button>
            )}
          </div>
        </div>

        {/* right: segments */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
          {d.segments.length === 0 && <div className="rounded-[20px] border-2 border-dashed border-line p-10 text-center text-[18px] text-mist">No segments yet. Add one from the left.</div>}
          {d.segments.map((s, i) => (
            <SegmentCard
              key={s.key} s={s} i={i} count={d.segments.length}
              on={(p) => setSeg(i, p)}
              up={() => setD((x) => ({ ...x, segments: move(x.segments, i, i - 1) }))}
              down={() => setD((x) => ({ ...x, segments: move(x.segments, i, i + 1) }))}
              dup={() => setD((x) => {
                const copy = { ...s, key: uid(), tracks: [] };
                const segments = x.segments.slice();
                segments.splice(i + 1, 0, copy);
                return { ...x, segments };
              })}
              del={() => setD((x) => ({ ...x, segments: x.segments.filter((_, j) => j !== i) }))}
            />
          ))}
        </div>
      </div>
    </Stage>
  );
}

function Labeled({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-1 flex-col gap-[6px]"><span className={label}>{text}</span>{children}</label>;
}

function Mini({ text, v, on }: { text: string; v: string; on: (v: string) => void }) {
  return (
    <label className="flex w-[64px] flex-col gap-1">
      <span className={label}>{text}</span>
      <input className={`${field} w-full px-2 text-center`} value={v} onChange={(e) => on(e.target.value)} inputMode="numeric" />
    </label>
  );
}

function Num({ v, on, w = 64, ph }: { v: string; on: (v: string) => void; w?: number; ph?: string }) {
  return <input className={`${field} px-2 text-center`} style={{ width: w }} value={v} onChange={(e) => on(e.target.value)} inputMode="numeric" placeholder={ph} />;
}

const ctl = "flex h-11 w-11 items-center justify-center rounded-full border-2 border-line text-[18px] text-ink disabled:opacity-30";

function SegmentCard({ s, i, count, on, up, down, dup, del }: {
  s: SegDraft; i: number; count: number; on: (p: Partial<SegDraft>) => void;
  up: () => void; down: () => void; dup: () => void; del: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border-2 border-line bg-tile p-4">
      <div className="flex items-center gap-3">
        <span className="w-6 text-center text-[15px] font-medium text-mist">{i + 1}</span>
        <input className={`${field} min-w-0 flex-1`} value={s.name} onChange={(e) => on({ name: e.target.value })} aria-label="Segment name" />
        <select className={`${field} w-[132px]`} value={s.type} onChange={(e) => on({ type: e.target.value as SegmentType })} aria-label="Type">
          {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <Num v={s.min} on={(v) => on({ min: v })} w={52} />
          <span className="text-mist">:</span>
          <Num v={s.sec.length === 1 ? s.sec.padStart(2, "0") : s.sec} on={(v) => on({ sec: v })} w={52} />
        </div>
        <button className={ctl} onClick={up} disabled={i === 0} aria-label="Move up">↑</button>
        <button className={ctl} onClick={down} disabled={i === count - 1} aria-label="Move down">↓</button>
        <button className={ctl} onClick={dup} aria-label="Duplicate segment">⧉</button>
        <button className={ctl} onClick={del} aria-label="Delete segment">✕</button>
      </div>
      <div className="flex items-center gap-3 pl-9">
        <span className="text-[12px] font-medium uppercase tracking-[.16em] text-ice">Cadence</span>
        <Num v={s.cadMin} on={(v) => on({ cadMin: v })} w={56} ph="min" /><span className="text-mist">–</span><Num v={s.cadMax} on={(v) => on({ cadMax: v })} w={56} ph="max" />
        <span className="ml-2 text-[12px] font-medium uppercase tracking-[.16em] text-mist">Resist.</span>
        <Num v={s.resMin} on={(v) => on({ resMin: v })} w={56} ph="min" /><span className="text-mist">–</span><Num v={s.resMax} on={(v) => on({ resMax: v })} w={56} ph="max" />
        <input className={`${field} min-w-0 flex-1`} value={s.cue} onChange={(e) => on({ cue: e.target.value })} placeholder="Cue shown during the segment" aria-label="Cue" />
      </div>
    </div>
  );
}
