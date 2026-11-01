"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Stage from "./Stage";
import { PRESETS, isPresetId, totalSeconds } from "@/lib/presets";
import { fmtClock } from "@/lib/format";
import {
  GENRES, VIBES, amazonSearchUrl, mergeTracks, playlistSeconds, toCsv, toPlaylistPrompt, toText,
} from "@/lib/music";
import type { Segment, Track, Workout } from "@/lib/types";

type UiTrack = Track & { key: string; locked?: boolean };
let n = 0;
const key = () => `t${Date.now().toString(36)}${(n++).toString(36)}`;
const strip = ({ key: _k, locked: _l, ...t }: UiTrack): Track => t;
const ui = (t: Track): UiTrack => ({ ...t, key: key() });

const TYPE_LABEL: Record<Segment["type"], string> = { warmup: "WARM-UP", flat: "FLAT", climb: "CLIMB", sprint: "SPRINT", recover: "RECOVER", cooldown: "COOL-DOWN" };
const chipStyle = (t: Segment["type"]): React.CSSProperties =>
  t === "flat" ? { background: "#66A5AD", color: "#002A33" }
  : t === "climb" ? { background: "#C4DFE6", color: "#002A33" }
  : t === "sprint" ? { border: "1px solid #C4DFE6", color: "#C4DFE6" }
  : { background: "#07575B", color: "#F4F5F7" };

const PASS_KEY = "ridedeck-passcode";
const store = {
  get: () => { try { return window.localStorage.getItem(PASS_KEY) ?? ""; } catch { return ""; } },
  set: (v: string) => { try { window.localStorage.setItem(PASS_KEY, v); } catch { /* ignore */ } },
};

const pill = "h-11 rounded-full border-2 border-line px-5 text-[14px] font-normal text-ink";
const lab = "text-[12px] font-medium uppercase tracking-[.2em] text-mist";

export default function MusicPlanner() {
  const wanted = useSearchParams().get("ride");
  const [saved, setSaved] = useState<Workout[]>([]);
  const [workout, setWorkout] = useState<Workout>(PRESETS[1]);
  const [genre, setGenre] = useState<string>("Rock");
  const [vibe, setVibe] = useState<string>("Classic");
  const [tracks, setTracks] = useState<UiTrack[]>([]);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState("");
  const [saving, setSaving] = useState(false);

  const choose = useCallback((w: Workout) => {
    setWorkout(w);
    setTracks((w.tracklist ?? []).map(ui));
    setPlaylistUrl(w.playlistUrl ?? "");
    if (w.genre) setGenre(w.genre);
    if (w.vibe) setVibe(w.vibe);
    setMsg(null);
  }, []);

  useEffect(() => { setPass(store.get()); }, []);
  useEffect(() => {
    fetch("/api/rides", { cache: "no-store" }).then((r) => r.json()).then((b) => {
      const rides: Workout[] = b.rides ?? [];
      setSaved(rides);
      const w = wanted && [...rides, ...PRESETS].find((x) => x.id === wanted);
      if (w) choose(w);
    }).catch(() => { /* presets still work */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  const plannedSec = useMemo(() => playlistSeconds(tracks), [tracks]);
  const rideSec = totalSeconds(workout);
  const anyBusy = busy.size > 0;

  /** Redo whole segments (locked songs stay), or with `onlyKey` replace just that one song. */
  async function run(regenerate: number[], onlyKey?: string) {
    setMsg(null);
    const keepers = tracks.filter((t) => (onlyKey ? t.key !== onlyKey : !regenerate.includes(t.segmentIndex) || t.locked));
    const replaced = tracks.filter((t) => !keepers.includes(t));
    setBusy(new Set(regenerate));
    try {
      const res = await fetch("/api/music/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-planner-passcode": pass },
        body: JSON.stringify({ workout: { ...workout, tracklist: undefined }, genre, vibe, regenerate, keep: keepers.map(strip), avoid: replaced.map((t) => t.title) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { setNeedPass(true); setMsg({ text: pass ? "That passcode didn't work." : "Enter the planner passcode." }); return; }
      if (!res.ok) { setMsg({ text: body.error ?? `Planning failed (${res.status})` }); return; }
      setNeedPass(false);
      const fresh: Track[] = body.tracks ?? [];
      setTracks(mergeTracks(keepers, fresh.map(ui)));
      if (!fresh.length && regenerate.length === 1) setMsg({ text: "No new song came back for that. Try again." });
    } catch (e) {
      setMsg({ text: (e as Error).message });
    } finally {
      setBusy(new Set());
    }
  }

  const planAll = () => run(workout.segments.map((_, i) => i));
  const toggleLock = (k: string) => setTracks((ts) => ts.map((t) => (t.key === k ? { ...t, locked: !t.locked } : t)));

  const copy = async () => {
    try { await navigator.clipboard.writeText(toText(tracks)); setMsg({ text: "Copied. Paste it into the Claude in Chrome chat.", ok: true }); }
    catch { setMsg({ text: "Couldn't copy automatically. Allow clipboard access and try again." }); }
  };
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(toPlaylistPrompt(workout, tracks.map(strip), genre, vibe)); setMsg({ text: "Prompt and songs copied. Paste it into a Claude in Chrome chat.", ok: true }); }
    catch { setMsg({ text: "Couldn't copy automatically. Allow clipboard access and try again." }); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(workout, tracks.map(strip))], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${workout.name.replace(/[^\w]+/g, "-").toLowerCase()}-tracklist.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  async function save() {
    setSaving(true); setMsg(null);
    const body = { ...workout, genre, vibe, playlistUrl: playlistUrl.trim() || undefined, tracklist: tracks.map(strip) };
    const preset = isPresetId(workout.id);
    try {
      const res = await fetch(preset ? "/api/rides" : `/api/rides/${workout.id}`, { method: preset ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ text: res.status === 503 ? "Airtable isn't connected, so the tracklist can't be saved." : out.error ?? `Save failed (${res.status})` }); return; }
      const w = out as Workout;
      setSaved((s) => [w, ...s.filter((x) => x.id !== w.id)]);
      setWorkout(w);
      setMsg({ text: preset ? "Saved as a new ride in your library." : "Saved to the ride.", ok: true });
    } catch (e) { setMsg({ text: (e as Error).message }); }
    finally { setSaving(false); }
  }

  const segs = workout.segments;
  const all = [...saved, ...PRESETS];

  return (
    <Stage bg="#002A33">
      <div className="flex h-full gap-10 bg-ground text-ink" style={{ padding: "32px 56px", boxSizing: "border-box" }}>
        {/* left: controls */}
        <div className="flex w-[340px] flex-none flex-col gap-4">
          <div className="flex flex-col gap-1">
            <a href="/" className="text-[13px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
            <span className="text-[34px] font-light uppercase leading-none" style={{ letterSpacing: ".02em" }}>Plan music</span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <span className={lab}>Ride</span>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
              {all.map((w) => (
                <button key={w.id} onClick={() => choose(w)} className={`flex flex-none flex-col gap-1 rounded-[16px] border-2 bg-tile px-4 py-3 text-left ${w.id === workout.id ? "border-ice" : "border-line"}`}>
                  <span className="truncate text-[16px] font-normal">{w.name}</span>
                  <span className="text-[13px] font-light text-mist">{w.segments.length} segments · {fmtClock(totalSeconds(w))}{w.tracklist?.length ? ` · ${w.tracklist.length} songs` : ""}</span>
                </button>
              ))}
            </div>
          </div>

          <Chips label="Genre" options={GENRES} value={genre} on={setGenre} />
          <Chips label="Vibe" options={VIBES} value={vibe} on={setVibe} />

          <button onClick={planAll} disabled={anyBusy} className="h-[60px] flex-none rounded-full bg-ice text-[16px] font-medium tracking-[.04em] text-ground disabled:opacity-50">
            {anyBusy ? "Planning…" : tracks.length ? "Regenerate unlocked" : "Plan tracklist"}
          </button>
        </div>

        {/* right: tracklist */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <span className={lab}>Tracklist · {genre} · {vibe}</span>
              <span className="text-[30px] font-light leading-none">
                {tracks.length} song{tracks.length === 1 ? "" : "s"} · {fmtClock(plannedSec)} of {fmtClock(rideSec)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={copyPrompt} disabled={!tracks.length} className="h-11 rounded-full bg-ice px-5 text-[14px] font-medium text-ground disabled:opacity-40">Copy prompt + playlist</button>
            <button onClick={copy} disabled={!tracks.length} className={`${pill} disabled:opacity-40`}>Copy list</button>
            <button onClick={download} disabled={!tracks.length} className={`${pill} disabled:opacity-40`}>Download CSV</button>
            <button onClick={save} disabled={!tracks.length || saving} className={`${pill} ml-auto disabled:opacity-40`}>
              {saving ? "Saving…" : isPresetId(workout.id) ? "Save as new ride" : "Save to ride"}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input value={playlistUrl} onChange={(e) => setPlaylistUrl(e.target.value)} placeholder="Playlist link from Amazon Music (paste after you build it)" inputMode="url"
              className="h-11 min-w-0 flex-1 rounded-[12px] border-2 border-line bg-tile px-3 text-[14px] text-ink outline-none focus:border-ice" />
            {needPass && (
              <input value={pass} onChange={(e) => { setPass(e.target.value); store.set(e.target.value); }} placeholder="Passcode" type="password"
                className="h-11 w-[150px] rounded-[12px] border-2 border-ice bg-tile px-3 text-[14px] text-ink outline-none" />
            )}
          </div>
          {msg && <p className={`text-[14px] ${msg.ok ? "text-mist" : "text-ice"}`}>{msg.text}</p>}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            {!tracks.length && !anyBusy && (
              <div className="rounded-[16px] border-2 border-dashed border-line p-8 text-center text-[16px] text-mist">
                Pick a ride, genre and vibe, then plan a tracklist paced to each segment.
              </div>
            )}
            {(tracks.length > 0 || anyBusy) && segs.map((seg, i) => {
              const rows = tracks.filter((t) => t.segmentIndex === i);
              const loading = busy.has(i);
              return (rows.length ? rows : [undefined]).map((t) => (
                <div key={t?.key ?? `empty-${i}`} className="flex h-16 flex-none items-center gap-3 rounded-[14px] bg-tile px-4" style={{ opacity: loading ? 0.5 : 1 }}>
                  <span className="box-border w-[140px] flex-none whitespace-nowrap rounded-[8px] px-2 py-[7px] text-center text-[11px] font-medium tracking-[.08em]" style={chipStyle(seg.type)}>
                    {TYPE_LABEL[seg.type]} {fmtClock(seg.durationSec)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="truncate text-[16px] font-normal">{t ? t.title : loading ? "Finding a song…" : "No song of its own"}</span>
                    <span className="truncate text-[13px] font-light text-mist">{t ? t.artist : "The previous song carries through, or redo to add one"}</span>
                  </div>
                  {t?.approxBpm && <span className="w-[52px] flex-none text-right text-[14px] font-light text-mist">~{t.approxBpm}</span>}
                  {t && <a href={amazonSearchUrl(t)} target="_blank" rel="noreferrer" className="w-[108px] flex-none text-right text-[13px] font-normal text-mist underline underline-offset-4">Find on Amazon</a>}
                  <div className="flex flex-none gap-1">
                    {t && <Icon label={t.locked ? "Unlock song" : "Lock song"} on={() => toggleLock(t.key)} active={t.locked}>{t.locked ? "●" : "○"}</Icon>}
                    {t && <Icon label="Swap this song" disabled={anyBusy || t.locked} on={() => run([i], t.key)}>⇄</Icon>}
                    <Icon label="Redo segment" disabled={anyBusy} on={() => run([i])}>↻</Icon>
                  </div>
                </div>
              ));
            })}
          </div>

          <span className="text-[13px] font-light leading-snug text-mist">
            Songs are suggestions from Claude. BPMs and lengths are approximate, not verified. Check each song in Amazon Music, then swap, lock or redo any row before you build the playlist.
          </span>
        </div>
      </div>
    </Stage>
  );
}

function Chips({ label, options, value, on }: { label: string; options: readonly string[]; value: string; on: (v: string) => void }) {
  return (
    <div className="flex flex-none flex-col gap-2">
      <span className={lab}>{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} onClick={() => on(o)} className={`rounded-full text-[14px] ${o === value ? "bg-ice px-4 py-[10px] font-medium text-ground" : "border-2 border-line px-[14px] py-2 text-ink"}`}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function Icon({ label, on, children, active, disabled }: { label: string; on: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={on} disabled={disabled}
      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-[16px] disabled:opacity-30 ${active ? "border-ice bg-ice text-ground" : "border-line text-ink"}`}>
      {children}
    </button>
  );
}
