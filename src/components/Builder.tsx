"use client";
import { useMemo, useState } from "react";
import Stage from "./Stage";
import { fmtClock } from "@/lib/format";
import { extractUrl, pasteLink } from "@/lib/url";
import {
  RATIO_SECONDS, TEMPLATES, applyFit, deleteSeg, draftTotals, duplicateSeg, intervalDefaults, mergeSongs, moveSeg, newFlat, newSeg, toRide, assignSongs,
  type RideDraft, type SegDraft, type SegType,
} from "@/lib/builderV2";
import { parseTracklist, type FlatRole, type IntervalKind, type IntervalRatio } from "@/lib/engine";

export type BuilderMode = { kind: "new" } | { kind: "edit"; id: string };

const field = "h-11 rounded-[12px] border-2 border-line bg-ground px-3 text-[15px] font-normal text-ink outline-none focus:border-ice";
const label = "text-[14px] font-medium uppercase tracking-[.14em] text-mist";
const ctl = "flex h-11 w-11 items-center justify-center rounded-full border-2 border-line text-[18px] text-ink disabled:opacity-30";

export default function Builder({ initial, mode }: { initial: RideDraft; mode: BuilderMode }) {
  const [d, setD] = useState<RideDraft>(initial);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [fitMsg, setFitMsg] = useState<{ lines: string[]; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const totals = useMemo(() => draftTotals(d), [d]);
  const songsBySeg = useMemo(() => assignSongs(d), [d]);

  const set = (patch: Partial<RideDraft>) => setD((x) => ({ ...x, ...patch }));
  const setSeg = (i: number, patch: Partial<SegDraft>) => setD((x) => ({ ...x, segments: x.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const add = (seg: SegDraft) => setD((x) => ({ ...x, segments: [...x.segments, seg] }));

  const importSongs = () => {
    const { songs, bad } = parseTracklist(paste);
    if (!songs.length && !bad.length) return;
    const m = mergeSongs(d.songs, songs);
    set({ songs: m.songs });
    setPaste(bad.join("\n"));
    setFitMsg({ ok: bad.length === 0, lines: [`${m.added} added, ${m.updated} updated.`, ...(bad.length ? [`${bad.length} line(s) not understood, left in the box. Use Artist - Title - m:ss.`] : [])] });
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
    try { ride = toRide(d, mode.kind === "edit" ? mode.id : ""); } catch (e) { return setMsg({ text: (e as Error).message }); }
    setBusy(true);
    try {
      const res = await fetch(mode.kind === "edit" ? `/api/rides/${mode.id}` : "/api/rides", {
        method: mode.kind === "edit" ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ride),
      });
      if (res.ok) { window.location.href = "/"; return; }
      const body = await res.json().catch(() => ({}));
      setMsg({ text: res.status === 503 ? "Airtable isn't connected yet, so rides can't be saved. Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in Vercel." : body.error ?? `Save failed (${res.status})` });
    } catch (e) { setMsg({ text: (e as Error).message }); }
    setBusy(false);
  };

  const remove = async () => {
    if (mode.kind !== "edit" || !window.confirm(`Delete "${d.name || "this ride"}"? This can't be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/rides/${mode.id}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/";
    else { setBusy(false); setMsg({ text: (await res.json().catch(() => ({}))).error ?? "Delete failed" }); }
  };

  const noLen = totals.songsMissing;
  return (
    <Stage bg="#002A33">
      <div className="flex h-full gap-8 bg-ground text-ink" style={{ padding: "28px 48px", boxSizing: "border-box" }}>
        {/* left */}
        <div className="flex w-[360px] flex-none flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" style={{ scrollbarWidth: "none" }}>
            <div className="flex flex-col gap-1">
              <a href="/" className="text-[14px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
              <span className="text-[28px] font-light uppercase leading-tight" style={{ letterSpacing: ".02em" }}>{mode.kind === "edit" ? "Edit ride" : d.sourceId ? "Edit (saves a new copy)" : "New ride"}</span>
            </div>
            <Labeled text="Name"><input className={field} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="28 min · Hills and intervals" /></Labeled>
            <div className="flex gap-3">
              <Labeled text="Genre"><input className={`${field} w-full`} value={d.genre} onChange={(e) => set({ genre: e.target.value })} placeholder="Rock" /></Labeled>
              <Labeled text="Vibe"><input className={`${field} w-full`} value={d.vibe} onChange={(e) => set({ vibe: e.target.value })} placeholder="Classic" /></Labeled>
            </div>
            <Labeled text="Playlist link"><input className={field} value={d.playlistUrl} onChange={(e) => set({ playlistUrl: e.target.value })} onPaste={(e) => pasteLink(e, (v) => set({ playlistUrl: v }))} onBlur={() => set({ playlistUrl: extractUrl(d.playlistUrl) || d.playlistUrl.trim() })} placeholder="https://music.amazon.com/…" inputMode="url" /></Labeled>

            <div className="flex flex-col gap-2">
              <span className={label}>Add segment</span>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => add(newFlat("steady"))} className="h-11 rounded-full border-2 border-line px-4 text-[14px]">+ Flat</button>
                <button onClick={() => add(newSeg("hill"))} className="h-11 rounded-full border-2 border-line px-4 text-[14px]">+ Hill</button>
                <button onClick={() => add(newSeg("interval"))} className="h-11 rounded-full border-2 border-line px-4 text-[14px]">+ Interval</button>
              </div>
              <span className={`${label} mt-1`}>Templates</span>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((t) => <button key={t.label} onClick={() => add(t.make())} className="h-11 rounded-full bg-tile px-4 text-[14px] text-ice">{t.label}</button>)}
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-[16px] bg-tile p-3">
              <span className={label}>Songs · {d.songs.length}</span>
              <p className="m-0 text-[14px] font-light text-mist">Paste one per line: <span className="text-ink">Artist - Title - 4:17</span>. Songs already listed get their length updated.</p>
              <textarea className={`${field} h-[96px] w-full resize-none py-2`} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Fleetwood Mac - Dreams - 4:17\nThe Clash - London Calling - 3:19"} />
              <button onClick={importSongs} className="h-11 rounded-full bg-ice text-[14px] font-medium text-ground">Add / update songs</button>
              {d.songs.length > 0 && (
                <div className="flex max-h-[150px] flex-col gap-1 overflow-y-auto">
                  {d.songs.map((x) => (
                    <div key={x.key} className="flex items-center justify-between gap-2 text-[14px]">
                      <span className="min-w-0 truncate">{x.artist} - {x.title}</span>
                      <span className={`flex-none ${x.durationSec === undefined ? "text-ice" : "text-mist"}`}>{x.durationSec !== undefined ? fmtClock(x.durationSec) : x.approxDurationSec ? `~${fmtClock(x.approxDurationSec)} est.` : "no length"}</span>
                      <button aria-label="Remove song" className="flex-none text-mist" onClick={() => set({ songs: d.songs.filter((y) => y.key !== x.key) })}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-none flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-light text-mist">
                Segments <span className="text-ink">{fmtClock(totals.segmentSec)}</span> · Music <span className="text-ink">{d.songs.length ? `${fmtClock(totals.musicSec)}${noLen ? "+" : ""}` : "—"}</span> · Stretch <span className="text-ink">~{fmtClock(totals.stretchSec)}</span>
              </span>
              {noLen > 0 && <span className="text-[14px] text-ice">{noLen} song(s) need a length before Fit to songs.</span>}
            </div>
            {d.songs.length > 0 && <button onClick={fit} className="h-11 rounded-full border-2 border-ice text-[14px] font-medium text-ice">Fit to songs</button>}
            {fitMsg && fitMsg.lines.map((l, i) => <p key={i} className={`m-0 text-[14px] leading-snug ${fitMsg.ok ? "text-mist" : "text-ice"}`}>{l}</p>)}
            {totals.error && <p className="m-0 text-[14px] leading-snug text-ice">{totals.error}</p>}
            {!totals.error && totals.warnings.filter((w) => w.code !== "song-duration-missing").map((w, i) => <p key={i} className="m-0 text-[14px] leading-snug text-ice">⚠ {w.message}</p>)}
            {msg && <p className={`m-0 text-[14px] leading-snug ${msg.ok ? "text-mist" : "text-ice"}`}>{msg.text}</p>}
            <button onClick={save} disabled={busy} className="h-[56px] rounded-full bg-ice text-[17px] font-medium text-ground disabled:opacity-50">{busy ? "Saving…" : mode.kind === "edit" ? "Save changes" : "Save ride"}</button>
            {mode.kind === "edit" && <button onClick={remove} disabled={busy} className="h-11 rounded-full border-2 border-line text-[14px] text-mist">Delete ride</button>}
          </div>
        </div>

        {/* right: segments */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
          {d.segments.length === 0 && <div className="rounded-[20px] border-2 border-dashed border-line p-10 text-center text-[18px] text-mist">No segments yet. Add one from the left.</div>}
          {d.segments.map((s, i) => (
            <SegmentCard key={s.key} s={s} i={i} count={d.segments.length} songs={songsBySeg[i].map((x) => `${x.artist} - ${x.title}${x.durationSec !== undefined ? ` (${fmtClock(x.durationSec)})` : ""}`)}
              on={(p) => setSeg(i, p)}
              up={() => setD((x) => moveSeg(x, i, i - 1))} down={() => setD((x) => moveSeg(x, i, i + 1))}
              dup={() => setD((x) => duplicateSeg(x, i))} del={() => setD((x) => deleteSeg(x, i))} />
          ))}
        </div>
      </div>
    </Stage>
  );
}

function Labeled({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-1 flex-col gap-[6px]"><span className={label}>{text}</span>{children}</label>;
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

const TYPE_LABEL: Record<SegType, string> = { flat: "Flat", interval: "Interval", hill: "Hill" };

function SegmentCard({ s, i, count, songs, on, up, down, dup, del }: {
  s: SegDraft; i: number; count: number; songs: string[]; on: (p: Partial<SegDraft>) => void; up: () => void; down: () => void; dup: () => void; del: () => void;
}) {
  const changeType = (t: SegType) => {
    const fresh = newSeg(t);
    on({ type: t, name: fresh.name, cue: fresh.cue, min: fresh.min, sec: fresh.sec, cadMin: fresh.cadMin, cadMax: fresh.cadMax, songCount: t === "flat" ? s.songCount : "1" });
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
        <select className={`${field} w-[120px]`} value={s.type} onChange={(e) => changeType(e.target.value as SegType)} aria-label="Type">
          {(Object.keys(TYPE_LABEL) as SegType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        {s.type === "interval" ? (
          <span className="w-[110px] text-center text-[18px] font-light">{fmtClock(ivSec)}</span>
        ) : (
          <div className="flex items-center gap-1"><Num v={s.min} on={(v) => on({ min: v })} w={52} /><span className="text-mist">:</span><Num v={s.sec.length === 1 ? s.sec.padStart(2, "0") : s.sec} on={(v) => on({ sec: v })} w={52} /></div>
        )}
        <button className={ctl} onClick={up} disabled={i === 0} aria-label="Move up">↑</button>
        <button className={ctl} onClick={down} disabled={i === count - 1} aria-label="Move down">↓</button>
        <button className={ctl} onClick={dup} aria-label="Duplicate segment">⧉</button>
        <button className={ctl} onClick={del} aria-label="Delete segment">✕</button>
      </div>

      {s.type === "flat" && (
        <div className="flex flex-wrap items-center gap-3 pl-9">
          <select className={`${field} w-[130px] px-2`} value={s.role} onChange={(e) => on({ role: e.target.value as FlatRole })} aria-label="Role">
            <option value="warmup">Warm-up</option><option value="steady">Steady</option><option value="recover">Recover</option><option value="cooldown">Cool-down</option>
          </select>
          <Pair text="Cadence" a={s.cadMin} b={s.cadMax} on={(a, b) => on({ cadMin: a, cadMax: b })} />
          <Pair text="Effort 1–10" a={s.effMin} b={s.effMax} on={(a, b) => on({ effMin: a, effMax: b })} />
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
            <select className={`${field} w-[210px] px-2`} value={s.workKind} onChange={(e) => on(intervalDefaults(e.target.value as IntervalKind))} aria-label="Kind">
              <option value="sprint">Sprint (fast, light)</option><option value="resistance">Resistance (heavy, slow)</option>
            </select>
            <select className={`${field} w-[90px] px-2`} value={s.ratio} onChange={(e) => { const r = e.target.value as IntervalRatio; on({ ratio: r, workSec: String(RATIO_SECONDS[r][0]), restSec: String(RATIO_SECONDS[r][1]) }); }} aria-label="Ratio">
              <option value="1:1">1:1</option><option value="2:1">2:1</option>
            </select>
            <div className="flex items-center gap-1"><span className="text-[14px] text-mist">On</span><Num v={s.workSec} on={(v) => on({ workSec: v })} w={52} /><span className="text-[14px] text-mist">Off</span><Num v={s.restSec} on={(v) => on({ restSec: v })} w={52} /><span className="text-[14px] text-mist">Rounds</span><Num v={s.rounds} on={(v) => on({ rounds: v })} w={52} /><span className="text-[14px] text-mist">Last rest ±s</span><Num v={s.adjust} on={(v) => on({ adjust: v })} w={56} /></div>
            <span className={`text-[14px] ${finalRest < 5 ? "text-ice" : "font-light text-mist"}`}>last rest {finalRest}s</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[14px] font-medium uppercase tracking-[.1em] text-ice">Work</span>
            <Pair text="Cadence" a={s.wCadMin} b={s.wCadMax} on={(a, b) => on({ wCadMin: a, wCadMax: b })} />
            <Pair text="Effort" a={s.wEffMin} b={s.wEffMax} on={(a, b) => on({ wEffMin: a, wEffMax: b })} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[14px] font-medium uppercase tracking-[.1em] text-mist">Rest</span>
            <Pair text="Cadence" a={s.rCadMin} b={s.rCadMax} on={(a, b) => on({ rCadMin: a, rCadMax: b })} />
            <Pair text="Effort" a={s.rEffMin} b={s.rEffMax} on={(a, b) => on({ rEffMin: a, rEffMax: b })} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 pl-9">
        <input className={`${field} min-w-0 flex-1`} value={s.cue} onChange={(e) => on({ cue: e.target.value })} placeholder="Cue shown during the segment" aria-label="Cue" />
        {s.type === "flat" && <div className="flex items-center gap-1"><span className="text-[14px] text-mist">Songs</span><Num v={s.songCount} on={(v) => on({ songCount: v })} w={48} /></div>}
      </div>
      {songs.length > 0 && <div className="pl-9 text-[14px] font-light text-mist">♪ {songs.join("  ·  ")}</div>}
    </div>
  );
}
