"use client";
import { useState } from "react";
import { fmtClock } from "@/lib/format";
import { extractUrl, isHttpUrl, pasteLink } from "@/lib/url";
import { ERAS, GENRES, VIBES, amazonSearchUrl, styleSummary, toPlaylistPromptV2 } from "@/lib/music";
import { TARGET_CHOICES, windowFor, type Check } from "@/lib/songFlow";
import type { RideDraft, SongDraft } from "@/lib/builderV2";

const chip = (on: boolean) => `h-8 flex-none rounded-full px-3 text-[14px] ${on ? "bg-ice font-medium text-ground" : "border-2 border-line text-ink"}`;
const lab = "flex-none text-[14px] font-medium uppercase tracking-[.12em] text-mist";
const inp = "h-9 rounded-[12px] border-2 border-line bg-tile px-3 text-[14px] text-ink outline-none focus:border-ice";

/** Step 1, all on one screen: the style strip on top, the songs in compact rows below. */
export default function MusicStep(p: {
  d: RideDraft; patch: (x: Partial<RideDraft>) => void; onTarget: (m: number) => void; check: Check;
  busy: string | null; swapping: number | null; bench: number;
  onPlan: () => void; onFix: () => void; onAdd: () => void; onSwap: (i: number) => void; onRemove: (i: number) => void; onLock: (i: number) => void; onFix1: (i: number) => void;
  onCopied: () => void; onAddBack: (key: string) => void; onUndo?: () => void;
  needPass: boolean; pass: string; onPass: (v: string) => void; quota?: { text: string; out: boolean } | null; onMsg: (text: string, ok?: boolean) => void; canCopy: boolean;
}) {
  const { d, patch, check, busy } = p;
  const onlyArtist = d.artistOnly && !!d.seeds.trim();
  const working = busy !== null;
  const w = windowFor(d.targetMin);
  const customTarget = !(TARGET_CHOICES as readonly number[]).includes(d.targetMin);
  const style = styleSummary({ eras: d.eras, genres: d.genres, artistOnly: onlyArtist, seeds: d.seeds });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(toPlaylistPromptV2(d.name.trim() || "RideDeck ride", d.songs, style, d.vibe)); p.onCopied(); p.onMsg("Prompt copied, and every song is now locked so the list matches the playlist you build. Unlock a song to change it.", true); }
    catch { p.onMsg("Couldn't copy automatically. Allow clipboard access and try again."); }
  };

  const n = d.songs.length;
  const cols = n <= 10 ? 1 : n <= 20 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(n / cols));
  const LIST_H = d.bench.length ? 296 : 330;
  const rowH = Math.max(30, Math.min(44, Math.floor(LIST_H / rows) - 4));

  const stateText =
    check.state === "ok" ? `${fmtClock(check.rideSec as number)} · inside the window`
    : check.state === "short" ? `${fmtClock(check.rideSec as number)} · ${fmtClock(check.deltaSec)} short`
    : check.state === "long" ? `${fmtClock(check.rideSec as number)} · ${fmtClock(-check.deltaSec)} over the window`
    : n ? "waiting on song lengths" : "";
  const stateColor = check.state === "ok" ? "text-ink" : check.state === "unknown" ? "text-mist" : "text-ice";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* the style strip */}
      <div className="flex flex-none flex-col gap-2">
        <div className="flex items-center gap-4">
          <input value={d.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Playlist name" maxLength={60} aria-label="Playlist name" className={`${inp} w-[230px] flex-none text-[15px]`} />
          <span className={lab}>Length</span>
          <div className="flex flex-none items-center gap-2">
            {TARGET_CHOICES.map((m) => <button key={m} aria-pressed={d.targetMin === m} onClick={() => p.onTarget(m)} className={chip(d.targetMin === m)}>{m} min</button>)}
            <input aria-label="Custom minutes" inputMode="numeric" placeholder="other" value={customTarget ? String(d.targetMin) : ""}
              onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "")); if (v) p.onTarget(Math.min(90, Math.max(10, v))); }} className={`${inp} h-8 w-[70px] rounded-full text-center`} />
          </div>
          <span className={lab}>Vibe</span>
          <div className="flex flex-none gap-2">{VIBES.map((v) => <button key={v} onClick={() => patch({ vibe: v })} className={chip((d.vibe || "Classic") === v)}>{v}</button>)}</div>
        </div>
        <div className={`flex items-center gap-3 ${onlyArtist ? "opacity-40" : ""}`}>
          <span className={lab}>Era</span>
          <div className="flex flex-none gap-[6px]">{ERAS.map((o) => <button key={o} disabled={onlyArtist} aria-pressed={d.eras.includes(o)} onClick={() => patch({ eras: toggle(d.eras, o) })} className={chip(d.eras.includes(o))}>{o}</button>)}</div>
          <span className={`${lab} ml-2`}>Genre</span>
          <div className="flex min-w-0 flex-wrap gap-[6px]">{GENRES.map((o) => <button key={o} disabled={onlyArtist} aria-pressed={d.genres.includes(o)} onClick={() => patch({ genres: toggle(d.genres, o) })} className={chip(d.genres.includes(o))}>{o}</button>)}</div>
        </div>
        <div className="flex items-center gap-4">
          <input value={d.seeds} onChange={(e) => patch({ seeds: e.target.value })} maxLength={300} spellCheck={false} placeholder="Sounds like: songs, artists, or a note (optional)" aria-label="Sounds like" className={`${inp} min-w-0 flex-1`} />
          <label className={`flex flex-none items-center gap-2 text-[14px] ${d.seeds.trim() ? "cursor-pointer" : "opacity-40"}`}>
            <input type="checkbox" checked={d.artistOnly} disabled={!d.seeds.trim()} onChange={(e) => patch({ artistOnly: e.target.checked })} className="h-5 w-5 accent-[#C4DFE6]" />All songs by this artist
          </label>
          {p.quota && <span className={`flex-none text-[14px] ${p.quota.out ? "text-ice" : "text-mist"}`}>{p.quota.text}</span>}
          <button onClick={p.onPlan} disabled={working} className="h-10 w-[190px] flex-none rounded-full bg-ice text-[15px] font-medium text-ground disabled:opacity-50">
            {busy === "plan" ? "Choosing songs…" : busy === "resolve" ? "Checking lengths…" : n ? "Plan new songs" : "Plan songs"}
          </button>
        </div>
        {p.needPass && <input value={p.pass} onChange={(e) => p.onPass(e.target.value)} placeholder="Passcode" type="password" aria-label="Passcode" className={`${inp} w-[200px] border-ice`} />}
      </div>

      {/* summary */}
      <div className="flex flex-none items-center gap-3">
        <span className="text-[20px] font-light">
          {n} song{n === 1 ? "" : "s"}{stateText && <> · <span className={stateColor}>{stateText}</span></>}
          <span className="ml-3 text-[14px] text-mist">target {d.targetMin} min · {fmtClock(w.minSec)}–{fmtClock(w.maxSec)}{p.bench ? ` · ${p.bench} spare${p.bench === 1 ? "" : "s"} held back` : ""}</span>
        </span>
        <span className="flex-1" />
        {p.onUndo && <button onClick={p.onUndo} className="h-9 rounded-full border-2 border-line px-4 text-[14px] text-ink">Undo</button>}
        {n > 0 && <button onClick={p.onFix} disabled={working} className="h-9 rounded-full border-2 border-ice px-4 text-[14px] font-medium text-ice disabled:opacity-40">{busy === "adjust" ? "Fixing…" : "Fix length"}</button>}
        {n > 0 && <button onClick={p.onAdd} disabled={working} className="h-9 rounded-full border-2 border-line px-4 text-[14px] text-ink disabled:opacity-40">{p.swapping === -1 ? "Adding…" : "+ Add song"}</button>}
      </div>

      {d.bench.length > 0 && (
        <div className="flex h-[30px] flex-none items-center gap-2 overflow-hidden" aria-label="Held back songs">
          <span className="flex-none text-[14px] text-mist">Held back:</span>
          {d.bench.slice(0, 6).map((s) => (
            <button key={s.key} onClick={() => p.onAddBack(s.key)} title={`${s.title} · ${s.artist}${s.durationSec ? ` · ${fmtClock(s.durationSec)}` : ""}`}
              className="h-[28px] max-w-[190px] flex-none truncate rounded-full border-2 border-line px-3 text-[14px] text-ink">+ {s.title}</button>
          ))}
          {d.bench.length > 6 && <span className="flex-none text-[14px] text-mist">+{d.bench.length - 6} more</span>}
        </div>
      )}

      {/* songs, in as many columns as it takes to fit with no scrolling */}
      <div className="min-h-0 flex-1">
        {!n ? (
          <div className="flex h-full items-center justify-center rounded-[16px] border-2 border-dashed border-line px-10 text-center text-[16px] text-mist">Name the playlist, pick a length and a style, then plan the songs. Real song lengths come from a music catalog and decide the ride.</div>
        ) : (
          <div className="grid gap-x-4 gap-y-1" style={{ gridAutoFlow: "column", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, ${rowH}px)` }}>
            {d.songs.map((s, i) => (
              <SongRow key={s.key} s={s} i={i} total={n} h={rowH} busy={working || p.swapping !== null} swapping={p.swapping === i}
                onSwap={() => p.onSwap(i)} onRemove={() => p.onRemove(i)} onLock={() => p.onLock(i)} onFix={() => p.onFix1(i)} />
            ))}
          </div>
        )}
      </div>

      {/* the playlist */}
      <div className="flex flex-none items-center gap-3">
        <button onClick={copy} disabled={!p.canCopy} className="h-10 flex-none rounded-full border-2 border-ice px-5 text-[14px] font-medium text-ice disabled:opacity-40">Copy prompt + playlist</button>
        <input value={d.playlistUrl} onChange={(e) => patch({ playlistUrl: e.target.value })} onPaste={(e) => pasteLink(e, (v) => patch({ playlistUrl: v }))} onBlur={() => patch({ playlistUrl: extractUrl(d.playlistUrl) || d.playlistUrl.trim() })}
          placeholder="Then paste the Amazon Music playlist link here" inputMode="url" aria-label="Playlist link" className={`${inp} h-10 min-w-0 flex-1`} />
        {isHttpUrl(extractUrl(d.playlistUrl) || d.playlistUrl.trim()) && (
          <a href={extractUrl(d.playlistUrl) || d.playlistUrl.trim()} target="_blank" rel="noopener noreferrer" className="flex h-10 flex-none items-center rounded-full bg-tile px-5 text-[14px] font-medium text-ice">Open ↗</a>
        )}
      </div>
    </div>
  );
}

function SongRow({ s, i, total, h, busy, swapping, onSwap, onRemove, onLock, onFix }: {
  s: SongDraft; i: number; total: number; h: number; busy: boolean; swapping: boolean; onSwap: () => void; onRemove: () => void; onLock: () => void; onFix: () => void;
}) {
  const role = i === 0 ? "WARM-UP" : i === total - 1 ? "COOL-DOWN" : "";
  const bad = s.status === "doubtful" || s.status === "missing" || (s.durationSec === undefined && s.status !== "pending");
  const src = s.durationSource === "typed" ? " ✎" : "";
  const ic = Math.min(34, h - 2);
  const btn = "flex flex-none items-center justify-center rounded-full border-2 text-[14px] disabled:opacity-30";
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-tile px-3" style={{ height: h, opacity: swapping ? 0.5 : 1 }} title={`${s.artist} · ${s.album ?? ""}`}>
      <span className="w-5 flex-none text-center text-[14px] text-mist">{i + 1}</span>
      <span className="min-w-0 flex-1 truncate text-[14px]">
        {swapping ? "Finding a song…" : <>{s.title}<span className="font-light text-mist"> · {s.artist}</span></>}
      </span>
      {role && <span className="flex-none text-[14px] font-medium tracking-[.1em] text-ice">{role}</span>}
      <button onClick={onFix} aria-label={bad ? "Confirm the length" : "Change the length"} title={bad ? "Confirm the version" : "Tap to change the length"}
        className={`flex-none rounded-full border-2 px-3 text-[14px] ${bad ? "border-ice text-ice" : "border-line text-ink"}`} style={{ height: ic, minWidth: 74 }}>
        {s.status === "pending" ? "…" : s.durationSec ? `${bad ? "? " : ""}${fmtClock(s.durationSec)}${src}` : "type it"}
      </button>
      <a href={amazonSearchUrl(s)} target="_blank" rel="noreferrer" className="flex-none text-[14px] text-mist underline underline-offset-4">Amazon</a>
      <button aria-label={s.locked ? "Unlock song" : "Lock song"} title="Lock: keep this song when fixing the length" onClick={onLock} className={`${btn} ${s.locked ? "border-ice bg-ice text-ground" : "border-line text-ink"}`} style={{ width: ic, height: ic }}>{s.locked ? "●" : "○"}</button>
      <button aria-label="Swap this song" title="Swap this song" onClick={onSwap} disabled={busy || s.locked} className={`${btn} border-line text-ink`} style={{ width: ic, height: ic }}>⇄</button>
      <button aria-label="Remove this song" title={s.locked ? "Unlock the song to remove it" : "Remove this song"} onClick={onRemove} disabled={busy || total <= 3 || s.locked} className={`${btn} border-line text-ink`} style={{ width: ic, height: ic }}>✕</button>
    </div>
  );
}
