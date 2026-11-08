"use client";
import { useMemo, useState } from "react";
import Stage from "./Stage";
import MusicPanel from "./MusicPanel";
import { fmtClock } from "@/lib/format";
import { extractUrl, pasteLink } from "@/lib/url";
import {
  RATIO_SECONDS, TEMPLATES, applyFit, applyTracks, deleteSeg, draftTotals, duplicateSeg, intervalDefaults, mergeSongs, moveSeg, newFlat, newSeg, toRide, assignSongs, tracksFromDraft,
  type RideDraft, type SegDraft, type SegType,
} from "@/lib/builderV2";
import { parseTracklist, rideToLegacyWorkout, type FlatRole, type IntervalKind, type IntervalRatio } from "@/lib/engine";
import { styleForSave } from "@/lib/music";
import type { Workout } from "@/lib/types";

export type Tab = "build" | "music";

const field = "h-11 rounded-[12px] border-2 border-line bg-ground px-3 text-[15px] font-normal text-ink outline-none focus:border-ice";
const label = "text-[14px] font-medium uppercase tracking-[.14em] text-mist";
const ctl = "flex h-11 w-11 items-center justify-center rounded-full border-2 border-line text-[18px] text-ink disabled:opacity-30";

/** A new ride (or a duplicate of one). Two tabs: BUILD RIDE and PLAN MUSIC. Always saves as a new ride. */
export default function Builder({ initial, tab: firstTab = "build", heard = [] }: { initial: RideDraft; tab?: Tab; heard?: string[] }) {
  const [tab, setTab] = useState<Tab>(firstTab);
  const [d, setD] = useState<RideDraft>(initial);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [fitMsg, setFitMsg] = useState<{ lines: string[]; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const totals = useMemo(() => draftTotals(d), [d]);
  const plannerWorkout = useMemo(() => (totals.ride ? ({ ...rideToLegacyWorkout(totals.ride), tracklist: undefined } as Workout) : null), [totals.ride]);
  const tracks = useMemo(() => tracksFromDraft(d), [d]);

  const set = (patch: Partial<RideDraft>) => setD((x) => ({ ...x, ...patch }));
  const setSeg = (i: number, patch: Partial<SegDraft>) => setD((x) => ({ ...x, segments: x.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const add = (seg: SegDraft) => setD((x) => ({ ...x, segments: [...x.segments, seg] }));

  const pasteLengths = (text: string) => {
    const { songs, bad } = parseTracklist(text);
    const m = mergeSongs(d.songs, songs);
    set({ songs: m.songs });
    return `${m.updated} updated, ${m.added} added.${bad.length ? ` ${bad.length} line(s) not understood (use Artist - Title - m:ss).` : ""}`;
  };
  const fit = () => {
    const out = applyFit(d);
    if (out.errors.length) return setFitMsg({ ok: false, lines: out.errors });
    setD(out.draft);
    setFitMsg({ ok: true, lines: ["Segments now end on song boundaries.", ...(out.unused ? [`${out.unused} song(s) are left over and play after the ride.`] : []), ...out.warnings.map((w) => w.message)] });
  };

  const save = async () => {
    setMsg(null);
    let ride;
    try { ride = toRide({ ...d, genre: styleForSave({ eras: d.eras, genres: d.genres, artistOnly: d.artistOnly, seeds: d.seeds }) || d.genre }); }
    catch (e) { return setMsg({ text: (e as Error).message }); }
    setBusy(true);
    try {
      const res = await fetch("/api/rides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ride) });
      if (res.ok) { window.location.href = "/"; return; }
      const body = await res.json().catch(() => ({}));
      setMsg({ text: res.status === 503 ? "Airtable isn't connected yet, so rides can't be saved. Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in Vercel." : body.error ?? `Save failed (${res.status})` });
    } catch (e) { setMsg({ text: (e as Error).message }); }
    setBusy(false);
  };

  const noLen = totals.songsMissing;
  const tabBtn = (t: Tab, text: string) => (
    <button onClick={() => setTab(t)} aria-pressed={tab === t}
      className={`h-11 rounded-full px-6 text-[14px] font-medium uppercase tracking-[.12em] ${tab === t ? "bg-ice text-ground" : "text-mist"}`}>{text}</button>
  );

  return (
    <Stage bg="#002A33">
      <div className="flex h-full flex-col gap-3 bg-ground text-ink" style={{ padding: "22px 48px 24px", boxSizing: "border-box" }}>
        {/* header: where you are, the two tabs, totals, save */}
        <div className="flex flex-none items-center gap-5">
          <a href="/" className="text-[14px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
          <span className="min-w-0 truncate text-[22px] font-light">{d.name || (d.sourceId ? "Converted ride" : "New ride")}</span>
          <div className="mx-auto flex gap-1 rounded-full border-2 border-line p-1">{tabBtn("build", "Build ride")}{tabBtn("music", "Plan music")}</div>
          <span className="flex-none text-[14px] font-light text-mist">
            Segments <span className="text-ink">{fmtClock(totals.segmentSec)}</span>{tab === "build" ? null : <> · Music <span className="text-ink">{d.songs.length ? `${noLen ? "~" : ""}${fmtClock(d.songs.reduce((t, x) => t + (x.durationSec ?? x.approxDurationSec ?? 0), 0))}` : "—"}</span></>} · Stretch <span className="text-ink">~{fmtClock(totals.stretchSec)}</span>
          </span>
          <button onClick={save} disabled={busy} className="h-11 flex-none rounded-full bg-ice px-7 text-[15px] font-medium text-ground disabled:opacity-50">{busy ? "Saving…" : "Save ride"}</button>
        </div>
        {msg && <p className={`m-0 flex-none text-[14px] leading-snug ${msg.ok ? "text-mist" : "text-ice"}`}>{msg.text}</p>}

        {tab === "build" ? (
          <div className="flex min-h-0 flex-1 gap-8">
            <div className="flex w-[350px] flex-none flex-col gap-3">
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" style={{ scrollbarWidth: "none" }}>
                <Labeled text="Name"><input className={field} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="28 min · Hills and intervals" /></Labeled>
                <div className="flex flex-col gap-2">
                  <span className={label}>Add segment</span>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => add(newFlat("steady"))} className="h-11 rounded-full border-2 border-line px-4 text-[14px]">+ Flat</button>
                    <button onClick={() => add(newSeg("hill"))} className="h-11 rounded-full border-2 border-line px-4 text-[14px]">+ Hill</button>
                    <button onClick={() => add(newSeg("interval"))} className="h-11 rounded-full border-2 border-line px-4 text-[14px]">+ Interval</button>
                  </div>
                  <span className={`${label} mt-1`}>Templates · all 4:00</span>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATES.map((t) => <button key={t.label} onClick={() => add(t.make())} className="h-11 rounded-full bg-tile px-4 text-[14px] text-ice">{t.label}</button>)}
                  </div>
                </div>

              </div>

              <div className="flex flex-none flex-col gap-2">
                {totals.error && <p className="m-0 text-[14px] leading-snug text-ice">{totals.error}</p>}
                {!totals.error && totals.warnings.filter((w) => w.code !== "song-duration-missing" && w.code !== "songs-vs-segments").map((w, i) => <p key={i} className="m-0 text-[14px] leading-snug text-ice">⚠ {w.message}</p>)}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
              {d.segments.length === 0 && <div className="rounded-[20px] border-2 border-dashed border-line p-10 text-center text-[18px] text-mist">No segments yet. Add one from the left.</div>}
              {d.segments.map((s, i) => (
                <SegmentCard key={s.key} s={s} i={i} count={d.segments.length}
                  on={(p) => setSeg(i, p)} up={() => setD((x) => moveSeg(x, i, i - 1))} down={() => setD((x) => moveSeg(x, i, i + 1))}
                  dup={() => setD((x) => duplicateSeg(x, i))} del={() => setD((x) => deleteSeg(x, i))} />
              ))}
            </div>
          </div>
        ) : plannerWorkout ? (
          <MusicPanel
            workout={plannerWorkout} tracks={tracks} onTracks={(t) => setD((x) => applyTracks(x, t))}
            style={{ eras: d.eras, genres: d.genres, seeds: d.seeds, artistOnly: d.artistOnly, vibe: d.vibe || "Classic" }}
            onStyle={(p) => set(p)}
            playlistUrl={d.playlistUrl} onPlaylistUrl={(v) => set({ playlistUrl: v })} heard={heard} onPasteLengths={pasteLengths}
            songCount={d.songs.length} songsMissing={noLen} onFit={fit} fitLines={fitMsg}
          />
        ) : (
          <div className="rounded-[20px] border-2 border-dashed border-line p-10 text-center text-[18px] text-mist">
            Fix the ride on the BUILD RIDE tab first, then plan its music.<br /><span className="text-[14px] text-ice">{totals.error}</span>
          </div>
        )}
      </div>
    </Stage>
  );
}

function Labeled({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-none flex-col gap-[6px]"><span className={label}>{text}</span>{children}</label>;
}
function Num({ v, on, w = 60, ph }: { v: string; on: (v: string) => void; w?: number; ph?: string }) {
  return <input className={`${field} px-2 text-center`} style={{ width: w }} value={v} onChange={(e) => on(e.target.value)} inputMode="numeric" placeholder={ph} />;
}
function Pair({ text, a, b, on, ph = ["min", "max"] }: { text: string; a: string; b: string; on: (a: string, b: string) => void; ph?: [string, string] }) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-[14px] font-medium uppercase tracking-[.1em] text-mist">{text}</span>
      <Num v={a} on={(v) => on(v, b)} w={52} ph={ph[0]} /><span className="text-mist">–</span><Num v={b} on={(v) => on(a, v)} w={52} ph={ph[1]} />
    </div>
  );
}

/** A row of buttons where exactly one is lit, so the choice is visible without opening a menu. */
function Choice<T extends string>({ value, options, on, aria }: { value: T; options: { v: T; text: string; sub?: string }[]; on: (v: T) => void; aria: string }) {
  return (
    <div role="group" aria-label={aria} className="flex gap-1 rounded-full border-2 border-line p-1">
      {options.map((o) => (
        <button key={o.v} aria-pressed={value === o.v} onClick={() => on(o.v)}
          className={`h-9 rounded-full px-4 text-[14px] font-medium ${value === o.v ? "bg-ice text-ground" : "text-mist"}`}>{o.text}{o.sub && <span className={`ml-2 font-light ${value === o.v ? "text-ground" : "text-mist"}`}>{o.sub}</span>}</button>
      ))}
    </div>
  );
}

function SegmentCard({ s, i, count, on, up, down, dup, del }: {
  s: SegDraft; i: number; count: number; on: (p: Partial<SegDraft>) => void; up: () => void; down: () => void; dup: () => void; del: () => void;
}) {
  const changeType = (t: SegType) => {
    const fresh = newSeg(t);
    on({ type: t, name: fresh.name, cue: fresh.cue, min: "4", sec: "0", cadMin: fresh.cadMin, cadMax: fresh.cadMax, songCount: t === "flat" ? s.songCount : "1" });
  };
  const hillSteps = s.type === "hill" ? Math.abs(Number(s.effTo) - Number(s.effFrom)) + 1 : 0;
  const hillSec = (Number(s.min) || 0) * 60 + (Number(s.sec) || 0);
  const ivSec = (Number(s.rounds) || 0) * ((Number(s.workSec) || 0) + (Number(s.restSec) || 0)) + (Number(s.adjust) || 0);
  const finalRest = (Number(s.restSec) || 0) + (Number(s.adjust) || 0);
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border-2 border-line bg-tile p-4">
      <div className="flex items-center gap-3">
        <span className="w-6 text-center text-[15px] font-medium text-mist">{i + 1}</span>
        <input className={`${field} min-w-0 flex-1`} value={s.name} onChange={(e) => on({ name: e.target.value })} aria-label="Segment name" />
        <Choice aria="Segment type" value={s.type} on={changeType} options={[{ v: "flat", text: "Flat" }, { v: "hill", text: "Hill" }, { v: "interval", text: "Interval" }]} />
        {s.type === "interval" ? (
          <span className="w-[70px] text-center text-[18px] font-light">{fmtClock(ivSec)}</span>
        ) : (
          <div className="flex items-center gap-1"><Num v={s.min} on={(v) => on({ min: v })} w={48} /><span className="text-mist">:</span><Num v={s.sec.length === 1 ? s.sec.padStart(2, "0") : s.sec} on={(v) => on({ sec: v })} w={48} /></div>
        )}
        <button className={ctl} onClick={up} disabled={i === 0} aria-label="Move up">↑</button>
        <button className={ctl} onClick={down} disabled={i === count - 1} aria-label="Move down">↓</button>
        <button className={ctl} onClick={dup} aria-label="Duplicate segment">⧉</button>
        <button className={ctl} onClick={del} aria-label="Delete segment">✕</button>
      </div>

      {s.type === "flat" && (
        <div className="flex flex-wrap items-center gap-3 pl-9">
          <Choice<FlatRole> aria="Role" value={s.role} on={(role) => on({ role })} options={[{ v: "warmup", text: "Warm-up" }, { v: "steady", text: "Steady" }, { v: "recover", text: "Recover" }, { v: "cooldown", text: "Cool-down" }]} />
          <Pair text="Cadence" a={s.cadMin} b={s.cadMax} on={(a, b) => on({ cadMin: a, cadMax: b })} />
          <Pair text="Effort" a={s.effMin} b={s.effMax} on={(a, b) => on({ effMin: a, effMax: b })} />
        </div>
      )}
      {s.type === "hill" && (
        <div className="flex flex-wrap items-center gap-3 pl-9">
          <Pair text="Cadence" a={s.cadMin} b={s.cadMax} on={(a, b) => on({ cadMin: a, cadMax: b })} />
          <Pair text="Effort" a={s.effFrom} b={s.effTo} on={(a, b) => on({ effFrom: a, effTo: b })} ph={["from", "to"]} />
          <div className="flex items-center gap-1"><span className="mr-1 text-[14px] font-medium uppercase tracking-[.1em] text-mist">Step s</span><Num v={s.stepSec} on={(v) => on({ stepSec: v })} w={52} ph="auto" /></div>
          <span className="text-[14px] font-light text-mist">{hillSteps > 1 && hillSec > 0 ? `${hillSteps} steps of ${fmtClock(Math.round(s.stepSec ? Number(s.stepSec) : hillSec / hillSteps))}` : hillSteps === 1 ? "one level: rides as flat" : ""}</span>
        </div>
      )}
      {s.type === "interval" && (
        <div className="flex flex-col gap-3 pl-9">
          <div className="flex flex-wrap items-center gap-3">
            <Choice<IntervalKind> aria="Interval kind" value={s.workKind} on={(k) => on(intervalDefaults(k))} options={[{ v: "sprint", text: "Sprint", sub: "fast, light" }, { v: "resistance", text: "Resistance", sub: "heavy, slow" }]} />
            <Choice<IntervalRatio> aria="Ratio" value={s.ratio} on={(r) => on({ ratio: r, workSec: String(RATIO_SECONDS[r][0]), restSec: String(RATIO_SECONDS[r][1]) })} options={[{ v: "1:1", text: "1:1" }, { v: "2:1", text: "2:1" }]} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] text-mist">On</span><Num v={s.workSec} on={(v) => on({ workSec: v })} w={52} />
            <span className="text-[14px] text-mist">Off</span><Num v={s.restSec} on={(v) => on({ restSec: v })} w={52} />
            <span className="text-[14px] text-mist">Rounds</span><Num v={s.rounds} on={(v) => on({ rounds: v })} w={52} />
            <span className="text-[14px] text-mist">Last rest ±s</span><Num v={s.adjust} on={(v) => on({ adjust: v })} w={56} />
            <span className={`text-[14px] ${finalRest < 5 ? "text-ice" : "font-light text-mist"}`}>last rest {finalRest}s</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="w-[52px] text-[14px] font-medium uppercase tracking-[.1em] text-ice">Work</span>
            <Pair text="Cadence" a={s.wCadMin} b={s.wCadMax} on={(a, b) => on({ wCadMin: a, wCadMax: b })} />
            <Pair text="Effort" a={s.wEffMin} b={s.wEffMax} on={(a, b) => on({ wEffMin: a, wEffMax: b })} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="w-[52px] text-[14px] font-medium uppercase tracking-[.1em] text-mist">Rest</span>
            <Pair text="Cadence" a={s.rCadMin} b={s.rCadMax} on={(a, b) => on({ rCadMin: a, rCadMax: b })} />
            <Pair text="Effort" a={s.rEffMin} b={s.rEffMax} on={(a, b) => on({ rEffMin: a, rEffMax: b })} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 pl-9">
        <input className={`${field} min-w-0 flex-1`} value={s.cue} onChange={(e) => on({ cue: e.target.value })} placeholder="Cue shown during the segment" aria-label="Cue" />
      </div>
    </div>
  );
}
