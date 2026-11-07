"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtClock } from "@/lib/format";
import { extractUrl, isHttpUrl, pasteLink } from "@/lib/url";
import {
  ERAS, GENRES, VIBES, amazonSearchUrl, mergeTracks, playlistSeconds, spreadCounts, styleSummary, toCsv, toPlaylistPrompt, toText,
} from "@/lib/music";
import type { Segment, Track, Workout } from "@/lib/types";

/**
 * The PLAN MUSIC tab. It works on the ride being built (its segments and songs live in the builder), so there is no
 * ride picker and no separate save: the builder's Save saves everything.
 */
export interface MusicStyle { eras: string[]; genres: string[]; seeds: string; artistOnly: boolean; vibe: string }

type UiTrack = Track & { key: string; locked?: boolean };
let n = 0;
const key = () => `t${Date.now().toString(36)}${(n++).toString(36)}`;
const strip = ({ key: _k, locked: _l, ...t }: UiTrack): Track => t;
const ui = (t: Track): UiTrack => ({ ...t, key: key() });

const TYPE_LABEL: Record<Segment["type"], string> = { warmup: "WARM-UP", flat: "FLAT", climb: "HILL", sprint: "INTERVALS", recover: "RECOVER", cooldown: "COOL-DOWN" };
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
const lab = "text-[14px] font-medium uppercase tracking-[.14em] text-mist";

export default function MusicPanel({ workout, tracks: initial, onTracks, style, onStyle, playlistUrl, onPlaylistUrl, heard, onPasteLengths }: {
  workout: Workout; tracks: Track[]; onTracks: (t: Track[]) => void;
  style: MusicStyle; onStyle: (p: Partial<MusicStyle>) => void;
  playlistUrl: string; onPlaylistUrl: (v: string) => void;
  /** Titles from your other rides, so the planner picks different songs. */
  heard: string[];
  /** Paste the playlist reply (Artist - Title - m:ss lines) to bring in real lengths. */
  onPasteLengths: (text: string) => string;
}) {
  const { eras, genres, seeds, artistOnly, vibe } = style;
  const [tracks, setTracks] = useState<UiTrack[]>(() => initial.map(ui));
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState("");
  const [paste, setPaste] = useState("");
  const first = useRef(true);

  useEffect(() => { setPass(store.get()); }, []);
  // Push changes up to the builder (not the initial copy).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    onTracks(tracks.map(strip));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  const plannedSec = useMemo(() => playlistSeconds(tracks), [tracks]);
  const rideSec = workout.segments.reduce((t, s) => t + s.durationSec, 0);
  const anyBusy = busy.size > 0;
  const onlyArtist = artistOnly && !!seeds.trim();
  const mix = !onlyArtist && (eras.length > 1 || genres.length > 1);
  const spread = spreadCounts(tracks, { eras, genres });
  const uneven = [spread.eras, spread.genres].some((g) => g.length > 1 && Math.max(...g.map((x) => x[1])) - Math.min(...g.map((x) => x[1])) > 1);

  /** Redo whole segments (locked songs stay), or with `onlyKey` replace just that one song (and only that one). */
  async function run(regenerate: number[], onlyKey?: string) {
    setMsg(null);
    const keepers = tracks.filter((t) => (onlyKey ? t.key !== onlyKey : !regenerate.includes(t.segmentIndex) || t.locked));
    const replaced = tracks.filter((t) => !keepers.includes(t));
    const avoid = [...new Set([...replaced.map((t) => t.title), ...heard])].slice(0, 150);
    setBusy(new Set(regenerate));
    try {
      const res = await fetch("/api/music/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-planner-passcode": pass },
        body: JSON.stringify({ workout: { ...workout, tracklist: undefined }, eras, genres, seeds, artistOnly: onlyArtist, vibe, regenerate, keep: keepers.map(strip), avoid, ...(onlyKey ? { exactly: 1 } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { setNeedPass(true); setMsg({ text: pass ? "That passcode didn't work." : "Enter the planner passcode." }); return; }
      if (!res.ok) { setMsg({ text: body.error ?? `Planning failed (${res.status})` }); return; }
      setNeedPass(false);
      const fresh: Track[] = body.tracks ?? [];
      setTracks(mergeTracks(keepers, fresh.map(ui)));
      const notes: string[] = Array.isArray(body.notes) ? body.notes : [];
      if (!fresh.length && regenerate.length === 1) setMsg({ text: notes.join(" ") || "No new song came back for that. Try again." });
      else if (notes.length) setMsg({ text: notes.join(" "), ok: fresh.length > 0 });
    } catch (e) {
      setMsg({ text: (e as Error).message });
    } finally {
      setBusy(new Set());
    }
  }

  const toggleLock = (k: string) => setTracks((ts) => ts.map((t) => (t.key === k ? { ...t, locked: !t.locked } : t)));
  const copyText = async (text: string, ok: string) => {
    try { await navigator.clipboard.writeText(text); setMsg({ text: ok, ok: true }); }
    catch { setMsg({ text: "Couldn't copy automatically. Allow clipboard access and try again." }); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(workout, tracks.map(strip))], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${workout.name.replace(/[^\w]+/g, "-").toLowerCase() || "ride"}-tracklist.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const segs = workout.segments;
  return (
    <div className="flex min-h-0 flex-1 gap-8">
      {/* left: style */}
      <div className="flex w-[330px] flex-none flex-col gap-3 overflow-y-auto pr-1" style={{ scrollbarWidth: "none" }}>
        <MultiChips label="Era" hint={onlyArtist ? "not used for one artist" : "none = any"} options={ERAS} value={eras} on={(v) => onStyle({ eras: v })} disabled={onlyArtist} />
        <MultiChips label="Genre" hint={onlyArtist ? "not used for one artist" : "pick several for a mix"} options={GENRES} value={genres} on={(v) => onStyle({ genres: v })} disabled={onlyArtist} />
        <Chips label="Vibe" options={VIBES} value={vibe} on={(v) => onStyle({ vibe: v })} />
        <label className="flex flex-none flex-col gap-2">
          <span className={lab}>Sounds like <span className="normal-case tracking-normal">(optional)</span></span>
          <input value={seeds} onChange={(e) => onStyle({ seeds: e.target.value })} maxLength={300} spellCheck={false} placeholder="Songs, artists, or a note"
            className="h-11 rounded-[12px] border-2 border-line bg-tile px-3 text-[14px] text-ink outline-none focus:border-ice" />
        </label>
        <label className={`flex flex-none items-start gap-3 ${seeds.trim() ? "cursor-pointer" : "opacity-40"}`}>
          <input type="checkbox" checked={artistOnly} disabled={!seeds.trim()} onChange={(e) => onStyle({ artistOnly: e.target.checked })} className="mt-[2px] h-[22px] w-[22px] flex-none accent-[#C4DFE6]" />
          <span className="flex flex-col gap-[2px]">
            <span className="text-[14px] font-normal">All songs by this artist</span>
            <span className="text-[14px] font-light leading-snug text-mist">{seeds.trim() ? "Only the artist you typed (or the artist of the song)." : "Type an artist or a song first."}</span>
          </span>
        </label>
        <button onClick={() => run(segs.map((_, i) => i))} disabled={anyBusy || !segs.length} className="h-[56px] flex-none rounded-full bg-ice text-[16px] font-medium text-ground disabled:opacity-50">
          {anyBusy ? "Planning…" : tracks.length ? "Regenerate unlocked" : "Plan tracklist"}
        </button>
      </div>

      {/* right: tracklist */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={lab}>{styleSummary({ eras, genres, artistOnly: onlyArtist, seeds })} · {vibe}</span>
          <span className="text-[26px] font-light leading-none">{tracks.length} song{tracks.length === 1 ? "" : "s"} · ~{fmtClock(plannedSec)} of {fmtClock(rideSec)}</span>
          {mix && tracks.length > 0 && (
            <span className={`text-[14px] font-light ${uneven ? "text-ice" : "text-mist"}`}>Spread · {[...spread.eras, ...spread.genres].map(([l, c]) => `${l} ${c}`).join(" · ")}{uneven ? " · uneven, try Regenerate unlocked" : ""}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => copyText(toPlaylistPrompt(workout, tracks.map(strip), styleSummary({ eras, genres, artistOnly: onlyArtist, seeds }), vibe), "Prompt and songs copied. Paste it into a Claude in Chrome chat.")} disabled={!tracks.length}
            className="h-11 rounded-full bg-ice px-5 text-[14px] font-medium text-ground disabled:opacity-40">Copy prompt + playlist</button>
          <button onClick={() => copyText(toText(tracks), "Copied. Paste it into the Claude in Chrome chat.")} disabled={!tracks.length} className={`${pill} disabled:opacity-40`}>Copy list</button>
          <button onClick={download} disabled={!tracks.length} className={`${pill} disabled:opacity-40`}>Download CSV</button>
        </div>

        <div className="flex items-center gap-3">
          <input value={playlistUrl} onChange={(e) => onPlaylistUrl(e.target.value)} onPaste={(e) => pasteLink(e, onPlaylistUrl)} onBlur={() => onPlaylistUrl(extractUrl(playlistUrl) || playlistUrl.trim())}
            placeholder="Playlist link from Amazon Music" inputMode="url" className="h-11 min-w-0 flex-1 rounded-[12px] border-2 border-line bg-tile px-3 text-[14px] text-ink outline-none focus:border-ice" />
          {isHttpUrl(extractUrl(playlistUrl) || playlistUrl.trim()) && (
            <a href={extractUrl(playlistUrl) || playlistUrl.trim()} target="_blank" rel="noopener noreferrer" className="flex h-11 flex-none items-center rounded-full bg-ice px-5 text-[14px] font-medium text-ground">Open playlist ↗</a>
          )}
          {needPass && <input value={pass} onChange={(e) => { setPass(e.target.value); store.set(e.target.value); }} placeholder="Passcode" type="password" className="h-11 w-[150px] rounded-[12px] border-2 border-ice bg-tile px-3 text-[14px] text-ink outline-none" />}
        </div>
        {msg && <p className={`m-0 text-[14px] ${msg.ok ? "text-mist" : "text-ice"}`}>{msg.text}</p>}

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
          {!tracks.length && !anyBusy && <div className="rounded-[16px] border-2 border-dashed border-line p-8 text-center text-[16px] text-mist">Pick a style and a vibe, then plan a tracklist paced to each segment.</div>}
          {(tracks.length > 0 || anyBusy) && segs.map((seg, i) => {
            const rows = tracks.filter((t) => t.segmentIndex === i);
            const loading = busy.has(i);
            return (rows.length ? rows : [undefined]).map((t) => (
              <div key={t?.key ?? `empty-${i}`} className="flex h-16 flex-none items-center gap-3 rounded-[14px] bg-tile px-4" style={{ opacity: loading ? 0.5 : 1 }}>
                <span className="box-border w-[150px] flex-none truncate whitespace-nowrap rounded-[8px] px-2 py-[7px] text-center text-[14px] font-medium" style={chipStyle(seg.type)}>{TYPE_LABEL[seg.type]} {fmtClock(seg.durationSec)}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate text-[16px] font-normal">{t ? t.title : loading ? "Finding a song…" : "Needs a song. Press redo."}</span>
                  <span className="truncate text-[14px] font-light text-mist">{t ? `${t.artist}${t.genre || t.era ? ` · ${[t.genre, t.era].filter(Boolean).join(" · ")}` : ""}${t.durationSec ? ` · ${fmtClock(t.durationSec)}` : t.approxDurationSec ? ` · ~${fmtClock(t.approxDurationSec)} est.` : ""}` : ""}</span>
                </div>
                {t && <a href={amazonSearchUrl(t)} target="_blank" rel="noreferrer" className="flex-none text-right text-[14px] font-normal text-mist underline underline-offset-4">Find on Amazon</a>}
                <div className="flex flex-none gap-1">
                  {t && <Icon label={t.locked ? "Unlock song" : "Lock song"} on={() => toggleLock(t.key)} active={t.locked}>{t.locked ? "●" : "○"}</Icon>}
                  {t && <Icon label="Swap this song" disabled={anyBusy || t.locked} on={() => run([i], t.key)}>⇄</Icon>}
                  <Icon label="Redo segment" disabled={anyBusy} on={() => run([i])}>↻</Icon>
                </div>
              </div>
            ));
          })}
        </div>

        <div className="flex flex-none flex-col gap-2 rounded-[14px] bg-tile p-3">
          <span className="text-[14px] font-light leading-snug text-mist">Songs are Claude's suggestions, and lengths marked "est." are guesses. After Claude in Chrome builds the playlist, paste its song list here (<span className="text-ink">Artist - Title - m:ss</span>) to bring in the real lengths.</span>
          <div className="flex gap-2">
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Fleetwood Mac - Dreams - 4:17"} className="h-[56px] min-w-0 flex-1 resize-none rounded-[12px] border-2 border-line bg-ground px-3 py-2 text-[14px] text-ink outline-none focus:border-ice" />
            <button onClick={() => { const r = onPasteLengths(paste); setMsg({ text: r, ok: !/not understood/.test(r) }); if (!/not understood/.test(r)) setPaste(""); }} disabled={!paste.trim()} className="h-[56px] rounded-full bg-ice px-5 text-[14px] font-medium text-ground disabled:opacity-40">Use lengths</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiChips({ label, hint, options, value, on, disabled }: { label: string; hint: string; options: readonly string[]; value: string[]; on: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className={`flex flex-none flex-col gap-2 ${disabled ? "opacity-40" : ""}`}>
      <span className={lab}>{label} <span className="normal-case tracking-normal">· {hint}</span></span>
      <div className="flex flex-wrap gap-[6px]">
        {options.map((o) => {
          const on_ = value.includes(o);
          return <button key={o} aria-pressed={on_} disabled={disabled} onClick={() => on(on_ ? value.filter((x) => x !== o) : [...value, o])}
            className={`rounded-full text-[14px] ${on_ ? "bg-ice px-[13px] py-[8px] font-medium text-ground" : "border-2 border-line px-[11px] py-[6px] text-ink"}`}>{o}</button>;
        })}
      </div>
    </div>
  );
}

function Chips({ label, options, value, on }: { label: string; options: readonly string[]; value: string; on: (v: string) => void }) {
  return (
    <div className="flex flex-none flex-col gap-2">
      <span className={lab}>{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => <button key={o} onClick={() => on(o)} className={`rounded-full text-[14px] ${o === value ? "bg-ice px-[13px] py-[8px] font-medium text-ground" : "border-2 border-line px-[11px] py-[6px] text-ink"}`}>{o}</button>)}
      </div>
    </div>
  );
}

function Icon({ label, on, children, active, disabled }: { label: string; on: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={on} disabled={disabled}
      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-[16px] disabled:opacity-30 ${active ? "border-ice bg-ice text-ground" : "border-line text-ink"}`}>{children}</button>
  );
}
