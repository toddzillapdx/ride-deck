"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stage from "./Stage";
import MusicStep from "./MusicStep";
import PlanStep from "./PlanStep";
import VersionPicker from "./VersionPicker";
import { fmtClock } from "@/lib/format";
import {
  addBack, aligned, arrangeDraft, fitDraft, lockAll, insertSong, newSong, removeSong, replaceSong, setPlanned, toRide,
  type RideDraft, type SongCandidate,
} from "@/lib/builderV2";
import { rideDuration } from "@/lib/engine";
import { styleForSave } from "@/lib/music";
import { SPARES, checkSongs, nextAdjustment, rideTitle, soundtrackProblems, songsNeeded } from "@/lib/songFlow";
import { NeedPasscode, applyResolved, passcode, planSongsApi, quotaLine, rememberApi, resolveApi, type PlanBody, type QuotaLine } from "@/lib/songClient";

export type Tab = "music" | "plan";

const DRAFT_KEY = "ridedeck-draft-v2";
const readDraft = (): RideDraft | null => {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const d = raw ? (JSON.parse(raw) as RideDraft) : null;
    return d && Array.isArray(d.songs) && Array.isArray(d.segments) ? { ...d, bench: d.bench ?? [] } : null;
  } catch { return null; }
};
const writeDraft = (d: RideDraft | null) => { try { if (d) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };

type Save = { phase: "idle" | "saving" | "saved" | "error"; text?: string };

/**
 * A new ride, in two linear steps: 1 SOUNDTRACK (songs and their real lengths) then 2 RIDE SEGMENTS (a segment for each song).
 * Nothing is saved until the last step. Work in progress is kept in this browser.
 */
export default function Builder({ initial, tab: firstTab = "music", heard = [], notice, restorable = false }: { initial: RideDraft; tab?: Tab; heard?: string[]; notice?: string; restorable?: boolean }) {
  const [start] = useState<RideDraft>(() => {
    if (restorable) { const r = readDraft(); if (r && r.songs.length) return r; }
    return initial;
  });
  const resumed = start !== initial;
  const [tab, setTab] = useState<Tab>(firstTab);
  const [d, setDState] = useState<RideDraft>(start);
  const ref = useRef(start);
  const tried = useRef<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(notice ? { text: notice, ok: true } : null);
  const [busy, setBusy] = useState<"plan" | "resolve" | "adjust" | "swap" | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState("");
  const [save, setSave] = useState<Save>({ phase: "idle" });
  const [picking, setPicking] = useState<number | null>(null);
  /** The list as it was before the last Fix length, so it can be put back. */
  const [undo, setUndo] = useState<RideDraft | null>(null);

  useEffect(() => { setPass(passcode.get()); }, []);
  const [quota, setQuota] = useState<QuotaLine | null>(null);
  /** How many song plans are left this week (nothing when accounts are off, or for the owner). */
  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/quota", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setQuota(res.ok && j.enabled ? quotaLine(j.plan) : null);
    } catch { /* the line just does not show */ }
  }, []);
  useEffect(() => { void refreshQuota(); }, [refreshQuota]);
  const commit = (next: RideDraft) => { ref.current = next; setDState(next); writeDraft(next.songs.length ? next : null); };
  const patch = (p: Partial<RideDraft>) => {
    const next = { ...ref.current, ...p };
    // A playlist link means the playlist exists: lock the songs so the list keeps matching it.
    commit(typeof p.playlistUrl === "string" && /^https?:\/\//i.test(p.playlistUrl.trim()) && !ref.current.songs.every((s) => s.locked) ? lockAll(next) : next);
  };

  const check = useMemo(() => checkSongs(d.songs, d.targetMin), [d.songs, d.targetMin]);
  const fitted = useMemo(() => (aligned(d) ? fitDraft(d) : null), [d]);
  const problems = useMemo(() => soundtrackProblems({ name: d.name, songs: d.songs, targetMin: d.targetMin, check }), [d.name, d.songs, d.targetMin, check]);
  const ready = problems.length === 0;

  const styleBody = (c: RideDraft): Pick<PlanBody, "eras" | "genres" | "vibe" | "seeds" | "artistOnly" | "targetMin"> => ({
    eras: c.eras, genres: c.genres, vibe: c.vibe || "Classic", seeds: c.seeds, artistOnly: c.artistOnly && !!c.seeds.trim(), targetMin: c.targetMin,
  });
  const fail = (e: unknown) => { if (e instanceof NeedPasscode) setNeedPass(true); setMsg({ text: (e as Error).message }); };

  /** Look up real lengths for every song not yet looked up. */
  async function resolveAll(): Promise<void> {
    const todo = ref.current.songs.filter((s) => s.status === "pending");
    if (!todo.length) return;
    try {
      const res = await resolveApi(todo.map((s) => ({ artist: s.artist, title: s.title })));
      commit({ ...ref.current, songs: applyResolved(ref.current.songs, res) });
    } catch (e) {
      commit({ ...ref.current, songs: ref.current.songs.map((s) => (s.status === "pending" ? { ...s, status: "missing", note: (e as Error).message } : s)) });
    }
  }

  /** Re-pick the warm-up and last song from real lengths and trim to the target. Free: no AI call. */
  function arrangeNow() {
    const { draft, arranged } = arrangeDraft(ref.current);
    commit(draft);
    return arranged;
  }

  async function planAll() {
    setMsg(null); setBusy("plan"); setUndo(null);
    try {
      const cur = ref.current;
      const r = await planSongsApi({ ...styleBody(cur), count: songsNeeded(cur.targetMin) + SPARES, spares: SPARES, avoid: [...tried.current, ...heard].slice(0, 150), keep: [] });
      setNeedPass(false);
      if (!r.songs.length) { setMsg({ text: r.notes.join(" ") || "No songs came back. Try again." }); return; }
      commit(setPlanned(ref.current, r.songs));
      setBusy("resolve");
      await resolveAll();
      const a = arrangeNow();
      const left = a.bench.length;
      setMsg({ text: [...r.notes, a.ok ? `Arranged to ${fmtClock(a.check.rideSec as number)}${left ? `, with ${left} spare${left === 1 ? "" : "s"} held back` : ""}.` : "Close. Use Fix length to finish the job."].join(" "), ok: a.ok });
    } catch (e) { fail(e); } finally { setBusy(null); void refreshQuota(); }
  }

  /** Replace the song at `index` with one the planner picks for that place. */
  async function swapAt(index: number, wantSec?: number): Promise<boolean> {
    const cur = ref.current;
    const old = cur.songs[index];
    if (!old) return false;
    if (old.locked) { setMsg({ text: `${old.title} is locked. Unlock it to swap.` }); return false; }
    setSwapping(index);
    try {
      const r = await planSongsApi({
        ...styleBody(cur), avoid: [...tried.current, ...heard, ...cur.songs.map((s) => s.title)].slice(0, 150),
        keep: cur.songs.filter((_, i) => i !== index).map((s) => ({ artist: s.artist, title: s.title })),
        slot: { index, total: cur.songs.length, before: cur.songs[index - 1] ? `${cur.songs[index - 1].artist} - ${cur.songs[index - 1].title}` : undefined, after: cur.songs[index + 1] ? `${cur.songs[index + 1].artist} - ${cur.songs[index + 1].title}` : undefined, ...(wantSec ? { wantSec } : {}) },
      });
      const p = r.songs[0];
      if (!p) { setMsg({ text: r.notes.join(" ") || "No new song came back for that. Try again." }); return false; }
      tried.current.add(old.title);
      commit(replaceSong(ref.current, index, newSong(p)));
      await resolveAll();
      return true;
    } catch (e) { fail(e); return false; } finally { setSwapping(null); }
  }

  /** Add a song at position `at` (default: just before the last song). */
  async function addSong(at?: number, wantSec?: number): Promise<boolean> {
    const cur = ref.current;
    const pos = at ?? Math.max(1, cur.songs.length - 1);
    setSwapping(-1);
    try {
      const r = await planSongsApi({
        ...styleBody(cur), avoid: [...tried.current, ...heard, ...cur.songs.map((s) => s.title)].slice(0, 150), keep: cur.songs.map((s) => ({ artist: s.artist, title: s.title })),
        slot: { index: pos, total: cur.songs.length + 1, before: cur.songs[pos - 1] ? `${cur.songs[pos - 1].artist} - ${cur.songs[pos - 1].title}` : undefined, after: cur.songs[pos] ? `${cur.songs[pos].artist} - ${cur.songs[pos].title}` : undefined, ...(wantSec ? { wantSec } : {}) },
      });
      const p = r.songs[0];
      if (!p) { setMsg({ text: r.notes.join(" ") || "No new song came back. Try again." }); return false; }
      commit(insertSong(ref.current, pos, newSong(p)));
      await resolveAll();
      return true;
    } catch (e) { fail(e); return false; } finally { setSwapping(null); }
  }

  const removeAt = (i: number) => { const s = ref.current.songs[i]; if (s) tried.current.add(s.title); commit(removeSong(ref.current, i)); };

  /** Arrange from real lengths first (free). Only if that cannot do it, ask the planner for the missing kind of song. */
  async function fixLength() {
    setMsg(null); setBusy("adjust");
    const before = ref.current;
    setUndo(before);
    const moved = () => {
      const keep = new Set(ref.current.songs.map((s) => s.key));
      const gone = before.songs.filter((s) => !keep.has(s.key)).map((s) => s.title);
      return gone.length ? ` Moved out of the ride: ${gone.join(", ")} (see Held back, or Undo).` : "";
    };
    try {
      for (let step = 0; step < 8; step++) {
        await resolveAll();
        const a = arrangeNow();
        if (a.ok) { setMsg({ text: `Ride is ${fmtClock(a.check.rideSec as number)}, inside the ${ref.current.targetMin} min window.${moved()}`, ok: true }); return; }
        const n = ref.current.songs.length;
        if (a.problem === "no-warmup") { if (!(await addSong(0))) return; continue; }
        if (a.problem === "no-cooldown") { if (!(await addSong(n))) return; continue; }
        const next = nextAdjustment(ref.current.songs, ref.current.targetMin);
        if (next.action === "none") break;
        if (next.action === "swap") { if (!(await swapAt(next.index, next.wantSec))) return; }
        else if (next.action === "add") { if (!(await addSong(next.before, next.wantSec))) return; }
        else removeAt(next.index);
      }
      const a = arrangeNow();
      setMsg(a.ok ? { text: `Ride is ${fmtClock(a.check.rideSec as number)}.${moved()}`, ok: true } : { text: `Close, but not there yet. Press Fix length again, or swap a song.${moved()}` });
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  const setTarget = (m: number) => {
    commit({ ...ref.current, targetMin: m });
    if (ref.current.songs.length && ref.current.songs.every((s) => s.durationSec !== undefined)) arrangeNow(); // spares may come back: free
  };

  const setLength = (i: number, sec: number, cand?: SongCandidate) => {
    const s = ref.current.songs[i];
    if (!s) return;
    commit({
      ...ref.current,
      songs: ref.current.songs.map((x, j) => (j === i ? { ...x, durationSec: sec, durationSource: cand ? "deezer" : "typed", ...(cand ? { album: cand.album } : {}), status: "ok" as const, note: undefined, candidates: undefined } : x)),
    });
    void rememberApi({ artist: s.artist, title: s.title, durationSec: sec, ...(cand ? { candidate: cand } : {}) });
    setPicking(null);
  };
  const copied = () => commit(lockAll(ref.current));
  const putBack = (key: string) => { commit(addBack(ref.current, key)); setUndo(null); };
  const undoFix = () => { if (undo) { commit(undo); setUndo(null); setMsg({ text: "Put the list back as it was.", ok: true }); } };
  const toggleLock = (i: number) => commit({ ...ref.current, songs: ref.current.songs.map((x, j) => (j === i ? { ...x, locked: !x.locked } : x)) });

  const title = check.rideSec !== undefined && d.name.trim() ? rideTitle(d.name, check.rideSec) : d.name.trim() ? `${d.name.trim()} ride` : d.sourceId ? "Converted ride" : "New ride";

  async function saveRide() {
    setSave({ phase: "saving" });
    if (problems.length) { setSave({ phase: "error", text: `Can't save yet: ${problems.join(" · ")}.` }); return; }
    if (!fitted || fitted.errors.length) { setSave({ phase: "error", text: fitted?.errors[0] ?? "Plan the songs first." }); return; }
    let ride;
    try {
      const f = fitted.draft;
      const total = toRide({ ...f, name: "x" });
      ride = toRide({ ...f, name: rideTitle(d.name, rideDuration(total)), genre: styleForSave({ eras: d.eras, genres: d.genres, artistOnly: d.artistOnly, seeds: d.seeds }) || d.genre });
    } catch (e) { setSave({ phase: "error", text: (e as Error).message }); return; }
    try {
      const res = await fetch("/api/rides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ride) });
      if (res.ok) {
        setSave({ phase: "saved", text: `Saved “${ride.name}”.` });
        writeDraft(null);
        setTimeout(() => { window.location.href = "/"; }, 900);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setSave({ phase: "error", text: res.status === 503 ? "The database isn't connected, so the ride can't be saved. Set SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel." : `Not saved (${res.status}): ${body.error ?? "unknown error"}` });
    } catch (e) { setSave({ phase: "error", text: `Not saved: ${(e as Error).message}` }); }
  }

  const startOver = () => { writeDraft(null); window.location.reload(); };
  const w1 = tab === "music";

  const stepPill = (n: number, text: string, active: boolean, done: boolean, onClick?: () => void) => (
    <button onClick={onClick} disabled={!onClick} aria-current={active ? "step" : undefined}
      className={`flex h-10 items-center gap-2 rounded-full px-5 text-[14px] font-medium uppercase tracking-[.1em] ${active ? "bg-ice text-ground" : done ? "border-2 border-ice text-ice" : "border-2 border-line text-mist"}`}>
      <span>{done && !active ? "✓" : n}</span>{text}
    </button>
  );

  return (
    <Stage bg="#002A33">
      <div className="relative flex h-full flex-col gap-3 bg-ground text-ink" style={{ padding: "16px 40px 16px", boxSizing: "border-box" }}>
        {/* header: the title may grow, the steps stay put on the right */}
        <div className="flex h-10 flex-none items-center gap-5">
          <a href="/" className="flex-none text-[14px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
          <span className="min-w-0 flex-1 truncate text-[20px] font-light">{title}</span>
          {resumed && <button onClick={startOver} className="flex-none text-[14px] text-mist underline underline-offset-4">Resumed your draft · start over</button>}
          <div className="flex flex-none items-center gap-2">
            {stepPill(1, "Soundtrack", w1, !w1, w1 ? undefined : () => setTab("music"))}
            <span className="text-mist">→</span>
            {stepPill(2, "Ride segments", !w1, false, undefined)}
          </div>
        </div>

        {/* the step */}
        <div className="min-h-0 flex-1">
          {w1 ? (
            <MusicStep
              d={d} patch={patch} onTarget={setTarget} check={check} busy={busy} swapping={swapping} bench={d.bench.length} canCopy={d.songs.length > 0 && d.songs.every((s) => s.durationSec !== undefined)}
              needPass={needPass} pass={pass} onPass={(v) => { setPass(v); passcode.set(v); }} quota={quota}
              onPlan={planAll} onFix={fixLength} onAdd={() => addSong()} onSwap={(i) => swapAt(i)} onRemove={removeAt} onLock={toggleLock} onFix1={(i) => setPicking(i)} onCopied={copied} onAddBack={putBack} onUndo={undo ? undoFix : undefined} onMsg={(text, ok) => setMsg({ text, ok })}
            />
          ) : (
            <PlanStep d={d} setD={commit} fitted={fitted} check={check} />
          )}
        </div>

        {/* the one call to action for this step */}
        <div className="flex min-h-[56px] flex-none items-center gap-4 border-t-2 border-line pt-3">
          <div className="min-w-0 flex-1">
            {w1 ? (
              problems.length ? <p className="m-0 text-[14px] leading-snug text-ice">To continue: {problems.join(" · ")}</p>
              : msg ? <p className={`m-0 text-[14px] leading-snug ${msg.ok ? "text-mist" : "text-ice"}`}>{msg.text}</p>
              : <p className="m-0 text-[14px] text-mist">The soundtrack is ready.</p>
            ) : save.phase === "error" ? <p className="m-0 text-[14px] leading-snug text-ice">{save.text}</p>
              : save.phase === "saved" ? <p className="m-0 text-[14px] text-ink">✓ {save.text}</p>
              : <p className="m-0 text-[14px] text-mist">Saving stores the ride and its music together in your library.</p>}
            {w1 && msg && problems.length > 0 && <p className={`m-0 mt-1 text-[14px] leading-snug ${msg.ok ? "text-mist" : "text-ice"}`}>{msg.text}</p>}
          </div>
          {w1 ? (
            <button onClick={() => { setMsg(null); setTab("plan"); }} disabled={!ready || busy !== null} className="h-12 flex-none rounded-full bg-ice px-10 text-[16px] font-medium text-ground disabled:opacity-40">Save soundtrack →</button>
          ) : (
            <>
              <button onClick={() => { setSave({ phase: "idle" }); setTab("music"); }} className="h-12 flex-none rounded-full border-2 border-line px-8 text-[15px] text-ink">← Soundtrack</button>
              <button onClick={saveRide} disabled={save.phase === "saving" || save.phase === "saved"} className="h-12 flex-none rounded-full bg-ice px-10 text-[16px] font-medium text-ground disabled:opacity-60">
                {save.phase === "saving" ? "Saving…" : save.phase === "saved" ? "Saved ✓" : save.phase === "error" ? "Try saving again" : "Save ride"}
              </button>
            </>
          )}
        </div>

        {picking !== null && d.songs[picking] && (
          <VersionPicker song={d.songs[picking]} onPick={(c) => setLength(picking, c.durationSec, c)} onType={(sec) => setLength(picking, sec)} onClose={() => setPicking(null)} />
        )}
      </div>
    </Stage>
  );
}
