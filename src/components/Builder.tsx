"use client";
import { useMemo, useRef, useState } from "react";
import Stage from "./Stage";
import MusicStep from "./MusicStep";
import PlanStep from "./PlanStep";
import { fmtClock } from "@/lib/format";
import {
  aligned, fitDraft, insertSong, newSong, removeSong, replaceSong, setPlanned, toRide,
  type RideDraft, type SongCandidate,
} from "@/lib/builderV2";
import { rideDuration } from "@/lib/engine";
import { styleForSave } from "@/lib/music";
import { checkSongs, nextAdjustment, rideTitle, songsNeeded, windowFor } from "@/lib/songFlow";
import { NeedPasscode, applyResolved, passcode, planSongsApi, rememberApi, resolveApi, type PlanBody } from "@/lib/songClient";

export type Tab = "music" | "plan";

/** A new ride (or a duplicate). Two steps: 1 MUSIC (the songs decide everything) and 2 PLAN RIDE (a segment for each song). */
export default function Builder({ initial, tab: firstTab = "music", heard = [], notice }: { initial: RideDraft; tab?: Tab; heard?: string[]; notice?: string }) {
  const [tab, setTab] = useState<Tab>(firstTab);
  const [d, setDState] = useState<RideDraft>(initial);
  const ref = useRef(initial);
  /** Titles swapped or removed this session, so Auto-adjust never hands one back. */
  const tried = useRef<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(notice ? { text: notice, ok: true } : null);
  const [busy, setBusy] = useState<"plan" | "resolve" | "adjust" | "swap" | "save" | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState(() => (typeof window === "undefined" ? "" : passcode.get()));

  const commit = (next: RideDraft) => { ref.current = next; setDState(next); };
  const patch = (p: Partial<RideDraft>) => commit({ ...ref.current, ...p });

  const check = useMemo(() => checkSongs(d.songs, d.targetMin), [d.songs, d.targetMin]);
  const fitted = useMemo(() => (aligned(d) ? fitDraft(d) : null), [d]);
  const rideSec = check.rideSec;
  const pendingLookups = d.songs.filter((s) => s.status === "pending").length;
  const doubtful = d.songs.filter((s) => s.status === "doubtful").length;
  const ready = d.songs.length >= 3 && d.songs.every((s) => s.durationSec !== undefined && s.status !== "doubtful" && s.status !== "pending" && s.status !== "missing");

  const styleBody = (c: RideDraft): Pick<PlanBody, "eras" | "genres" | "vibe" | "seeds" | "artistOnly" | "targetMin"> => ({
    eras: c.eras, genres: c.genres, vibe: c.vibe || "Classic", seeds: c.seeds, artistOnly: c.artistOnly && !!c.seeds.trim(), targetMin: c.targetMin,
  });
  const fail = (e: unknown) => {
    if (e instanceof NeedPasscode) setNeedPass(true);
    setMsg({ text: (e as Error).message });
  };

  /** Look up real lengths for every song that has not been looked up. */
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

  async function planAll() {
    setMsg(null); setBusy("plan");
    try {
      const cur = ref.current;
      const r = await planSongsApi({ ...styleBody(cur), count: songsNeeded(cur.targetMin), avoid: heard.slice(0, 150), keep: [] });
      setNeedPass(false);
      if (!r.songs.length) { setMsg({ text: r.notes.join(" ") || "No songs came back. Try again." }); return; }
      commit(setPlanned(ref.current, r.songs));
      if (r.notes.length) setMsg({ text: r.notes.join(" "), ok: true });
      setBusy("resolve");
      await resolveAll();
    } catch (e) { fail(e); } finally { setBusy(null); }
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

  /** Add a song before position `before` (default: just before the last song). */
  async function addSong(before?: number, wantSec?: number): Promise<boolean> {
    const cur = ref.current;
    const at = before ?? Math.max(1, cur.songs.length - 1);
    setSwapping(-1);
    try {
      const r = await planSongsApi({
        ...styleBody(cur), avoid: [...tried.current, ...heard, ...cur.songs.map((s) => s.title)].slice(0, 150), keep: cur.songs.map((s) => ({ artist: s.artist, title: s.title })),
        slot: { index: at, total: cur.songs.length + 1, before: cur.songs[at - 1] ? `${cur.songs[at - 1].artist} - ${cur.songs[at - 1].title}` : undefined, after: cur.songs[at] ? `${cur.songs[at].artist} - ${cur.songs[at].title}` : undefined, ...(wantSec ? { wantSec } : {}) },
      });
      const p = r.songs[0];
      if (!p) { setMsg({ text: r.notes.join(" ") || "No new song came back. Try again." }); return false; }
      commit(insertSong(ref.current, at, newSong(p)));
      await resolveAll();
      return true;
    } catch (e) { fail(e); return false; } finally { setSwapping(null); }
  }

  const removeAt = (i: number) => { const s = ref.current.songs[i]; if (s) tried.current.add(s.title); commit(removeSong(ref.current, i)); };

  /** Swap and add songs until the ride is in its window and the first and last songs fit their jobs. */
  async function autoAdjust() {
    setMsg(null); setBusy("adjust");
    try {
      for (let step = 0; step < 8; step++) {
        await resolveAll();
        const songs = ref.current.songs;
        const c = checkSongs(songs, ref.current.targetMin);
        if (c.issues.some((x) => x.kind === "missing")) { setMsg({ text: "Some songs have no length yet. Tap a song's length to type it, then run Auto-adjust again." }); return; }
        const bad = c.issues.find((x) => x.kind === "first-length" || x.kind === "last-short");
        if (bad) { if (!(await swapAt(bad.index))) return; continue; }
        const a = nextAdjustment(songs, ref.current.targetMin);
        if (a.action === "none") break;
        if (a.action === "swap") { if (!(await swapAt(a.index, a.wantSec))) return; }
        else if (a.action === "add") { if (!(await addSong(a.before, a.wantSec))) return; }
        else removeAt(a.index);
      }
      const c = checkSongs(ref.current.songs, ref.current.targetMin);
      const unsure = ref.current.songs.filter((x) => x.status === "doubtful").length;
      if (c.state === "ok" && !c.issues.length && unsure) setMsg({ text: `Ride is ${fmtClock(c.rideSec as number)}. ${unsure} song${unsure === 1 ? "" : "s"} still need a version check, which can change the length.`, ok: true });
      else if (c.state === "ok" && !c.issues.length) setMsg({ text: `Ride is ${fmtClock(c.rideSec as number)}, inside the ${d.targetMin} min window.`, ok: true });
      else setMsg({ text: "Close, but not there yet. Run Auto-adjust again, or swap a song by hand." });
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  const setLength = (i: number, sec: number) => {
    const s = ref.current.songs[i];
    if (!s) return;
    commit({ ...ref.current, songs: ref.current.songs.map((x, j) => (j === i ? { ...x, durationSec: sec, durationSource: "typed", status: "ok", note: undefined, candidates: undefined } : x)) });
    void rememberApi({ artist: s.artist, title: s.title, durationSec: sec });
  };
  const pick = (i: number, c: SongCandidate) => {
    const s = ref.current.songs[i];
    if (!s) return;
    commit({ ...ref.current, songs: ref.current.songs.map((x, j) => (j === i ? { ...x, durationSec: c.durationSec, durationSource: "deezer", album: c.album, status: "ok", note: undefined, candidates: undefined } : x)) });
    void rememberApi({ artist: s.artist, title: s.title, durationSec: c.durationSec, candidate: c });
  };
  const toggleLock = (i: number) => commit({ ...ref.current, songs: ref.current.songs.map((x, j) => (j === i ? { ...x, locked: !x.locked } : x)) });

  const title = rideSec !== undefined && d.name.trim() ? rideTitle(d.name, rideSec) : d.name.trim() ? `${d.name.trim()} ride` : d.sourceId ? "Converted ride" : "New ride";

  const save = async () => {
    setMsg(null);
    if (!d.name.trim()) return setMsg({ text: "Give the playlist a name first (Music step)." });
    if (!fitted || fitted.errors.length) return setMsg({ text: fitted?.errors[0] ?? "Plan the songs first." });
    if (check.state === "short") return setMsg({ text: `The ride is ${fmtClock(check.deltaSec)} short of ${d.targetMin} min. Use Auto-adjust, or lower the target.` });
    if (check.issues.some((x) => x.kind !== "missing")) return setMsg({ text: check.issues.find((x) => x.kind !== "missing")!.message });
    let ride;
    try {
      const f = fitted.draft;
      const total = toRide({ ...f, name: "x" });
      ride = toRide({ ...f, name: rideTitle(d.name, rideDuration(total)), genre: styleForSave({ eras: d.eras, genres: d.genres, artistOnly: d.artistOnly, seeds: d.seeds }) || d.genre });
    } catch (e) { return setMsg({ text: (e as Error).message }); }
    setBusy("save");
    try {
      const res = await fetch("/api/rides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ride) });
      if (res.ok) { window.location.href = "/"; return; }
      const body = await res.json().catch(() => ({}));
      setMsg({ text: res.status === 503 ? "Airtable isn't connected yet, so rides can't be saved. Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in Vercel." : body.error ?? `Save failed (${res.status})` });
    } catch (e) { setMsg({ text: (e as Error).message }); }
    setBusy(null);
  };

  const tabBtn = (t: Tab, n: number, text: string, off = false) => (
    <button onClick={() => setTab(t)} disabled={off} aria-pressed={tab === t}
      className={`h-11 rounded-full px-6 text-[14px] font-medium uppercase tracking-[.12em] disabled:opacity-40 ${tab === t ? "bg-ice text-ground" : "text-mist"}`}>{n} · {text}</button>
  );
  const w = windowFor(d.targetMin);

  return (
    <Stage bg="#002A33">
      <div className="flex h-full flex-col gap-3 bg-ground text-ink" style={{ padding: "22px 48px 24px", boxSizing: "border-box" }}>
        <div className="flex flex-none items-center gap-5">
          <a href="/" className="text-[14px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
          <span className="min-w-0 truncate text-[22px] font-light">{title}</span>
          <div className="mx-auto flex gap-1 rounded-full border-2 border-line p-1">{tabBtn("music", 1, "Music")}{tabBtn("plan", 2, "Plan ride", !ready)}</div>
          <span className="flex-none text-[14px] font-light text-mist">
            Ride <span className={check.state === "short" ? "text-ice" : "text-ink"}>{rideSec !== undefined ? fmtClock(rideSec) : "—"}</span> of {fmtClock(w.minSec)}–{fmtClock(w.maxSec)}
          </span>
          <button onClick={save} disabled={busy === "save"} className="h-11 flex-none rounded-full bg-ice px-7 text-[15px] font-medium text-ground disabled:opacity-50">{busy === "save" ? "Saving…" : "Save ride"}</button>
        </div>
        {msg && <p className={`m-0 flex-none text-[14px] leading-snug ${msg.ok ? "text-mist" : "text-ice"}`}>{msg.text}</p>}

        {tab === "music" ? (
          <MusicStep
            d={d} patch={patch} check={check} busy={busy} swapping={swapping} pendingLookups={pendingLookups} doubtful={doubtful} ready={ready}
            needPass={needPass} pass={pass} onPass={(v) => { setPass(v); passcode.set(v); }}
            onPlan={planAll} onAuto={autoAdjust} onAdd={() => addSong()} onSwap={(i) => swapAt(i)} onRemove={removeAt}
            onLength={setLength} onPick={pick} onLock={toggleLock} onNext={() => setTab("plan")} onMsg={(text, ok) => setMsg({ text, ok })}
          />
        ) : (
          <PlanStep d={d} setD={commit} fitted={fitted} check={check} />
        )}
      </div>
    </Stage>
  );
}

