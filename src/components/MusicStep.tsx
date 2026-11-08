"use client";
import { useState } from "react";
import { fmtClock } from "@/lib/format";
import { extractUrl, isHttpUrl, pasteLink } from "@/lib/url";
import { ERAS, GENRES, VIBES, amazonSearchUrl, styleSummary, toPlaylistPromptV2 } from "@/lib/music";
import { TARGET_CHOICES, windowFor, type Check } from "@/lib/songFlow";
import type { RideDraft, SongCandidate, SongDraft } from "@/lib/builderV2";
import { Chips, Icon, MultiChips, label, pill } from "./builderUi";

const parseLen = (t: string): number | null => {
  const m = t.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(t.trim());
  return Number.isFinite(n) && n >= 20 && n <= 1800 && /^\d+$/.test(t.trim()) ? n : null;
};

/** Step 1: choose the vibe and a length, get the songs, and make sure every song has a real length. */
export default function MusicStep(p: {
  d: RideDraft; patch: (x: Partial<RideDraft>) => void; check: Check;
  busy: string | null; swapping: number | null; pendingLookups: number; doubtful: number; ready: boolean;
  needPass: boolean; pass: string; onPass: (v: string) => void;
  onPlan: () => void; onAuto: () => void; onAdd: () => void; onSwap: (i: number) => void; onRemove: (i: number) => void;
  onLength: (i: number, sec: number) => void; onPick: (i: number, c: SongCandidate) => void; onLock: (i: number) => void; onNext: () => void;
  onMsg: (text: string, ok?: boolean) => void;
}) {
  const { d, patch, check, busy } = p;
  const onlyArtist = d.artistOnly && !!d.seeds.trim();
  const working = busy !== null;
  const w = windowFor(d.targetMin);
  const customTarget = !(TARGET_CHOICES as readonly number[]).includes(d.targetMin);
  const style = styleSummary({ eras: d.eras, genres: d.genres, artistOnly: onlyArtist, seeds: d.seeds });

  const copy = async () => {
    const text = toPlaylistPromptV2(d.name.trim() || "RideDeck ride", d.songs, style, d.vibe);
    try { await navigator.clipboard.writeText(text); p.onMsg("Prompt and songs copied. Paste it into a Claude in Chrome chat.", true); }
    catch { p.onMsg("Couldn't copy automatically. Allow clipboard access and try again."); }
  };

  const stateText =
    check.state === "ok" ? `${fmtClock(check.rideSec as number)} · inside the window`
    : check.state === "short" ? `${fmtClock(check.rideSec as number)} · ${fmtClock(check.deltaSec)} short`
    : check.state === "long" ? `${fmtClock(check.rideSec as number)} · ${fmtClock(-check.deltaSec)} over the window`
    : d.songs.length ? "waiting on song lengths" : "";
  const stateColor = check.state === "ok" ? "text-ink" : check.state === "unknown" ? "text-mist" : "text-ice";
  const needsFix = check.state === "short" || check.state === "long" || check.issues.some((i) => i.kind !== "missing");

  return (
    <div className="flex min-h-0 flex-1 gap-8">
      {/* left: what kind of ride */}
      <div className="flex w-[330px] flex-none flex-col gap-3 overflow-y-auto pr-1" style={{ scrollbarWidth: "none" }}>
        <label className="flex flex-none flex-col gap-2">
          <span className={label}>Playlist name</span>
          <input value={d.name} onChange={(e) => patch({ name: e.target.value })} placeholder="80s Hip Hop" maxLength={60}
            className="h-11 rounded-[12px] border-2 border-line bg-tile px-3 text-[15px] text-ink outline-none focus:border-ice" />
        </label>
        <div className="flex flex-none flex-col gap-2">
          <span className={label}>Ride length <span className="normal-case tracking-normal">· never shorter, up to 2:00 over</span></span>
          <div className="flex flex-wrap items-center gap-2">
            {TARGET_CHOICES.map((m) => (
              <button key={m} aria-pressed={d.targetMin === m} onClick={() => patch({ targetMin: m })}
                className={`rounded-full text-[14px] ${d.targetMin === m ? "bg-ice px-[13px] py-[8px] font-medium text-ground" : "border-2 border-line px-[11px] py-[6px] text-ink"}`}>{m} min</button>
            ))}
            <input aria-label="Custom minutes" inputMode="numeric" placeholder="other" value={customTarget ? String(d.targetMin) : ""}
              onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (n) patch({ targetMin: Math.min(90, Math.max(10, n)) }); }}
              className="h-9 w-[72px] rounded-full border-2 border-line bg-tile px-3 text-center text-[14px] text-ink outline-none focus:border-ice" />
          </div>
        </div>
        <MultiChips text="Era" hint={onlyArtist ? "not used for one artist" : "none = any"} options={ERAS} value={d.eras} on={(v) => patch({ eras: v })} disabled={onlyArtist} />
        <MultiChips text="Genre" hint={onlyArtist ? "not used for one artist" : "pick several for a mix"} options={GENRES} value={d.genres} on={(v) => patch({ genres: v })} disabled={onlyArtist} />
        <Chips text="Vibe" options={VIBES} value={d.vibe || "Classic"} on={(v) => patch({ vibe: v })} />
        <label className="flex flex-none flex-col gap-2">
          <span className={label}>Sounds like <span className="normal-case tracking-normal">(optional)</span></span>
          <input value={d.seeds} onChange={(e) => patch({ seeds: e.target.value })} maxLength={300} spellCheck={false} placeholder="Songs, artists, or a note"
            className="h-11 rounded-[12px] border-2 border-line bg-tile px-3 text-[14px] text-ink outline-none focus:border-ice" />
        </label>
        <label className={`flex flex-none items-start gap-3 ${d.seeds.trim() ? "cursor-pointer" : "opacity-40"}`}>
          <input type="checkbox" checked={d.artistOnly} disabled={!d.seeds.trim()} onChange={(e) => patch({ artistOnly: e.target.checked })} className="mt-[2px] h-[22px] w-[22px] flex-none accent-[#C4DFE6]" />
          <span className="flex flex-col gap-[2px]">
            <span className="text-[14px] font-normal">All songs by this artist</span>
            <span className="text-[14px] font-light leading-snug text-mist">{d.seeds.trim() ? "Only the artist you typed (or the artist of the song)." : "Type an artist or a song first."}</span>
          </span>
        </label>
        <button onClick={p.onPlan} disabled={working} className="h-[56px] flex-none rounded-full bg-ice text-[16px] font-medium text-ground disabled:opacity-50">
          {busy === "plan" ? "Choosing songs…" : busy === "resolve" ? "Checking lengths…" : d.songs.length ? "Start over with new songs" : "Plan songs"}
        </button>
        {p.needPass && <input value={p.pass} onChange={(e) => p.onPass(e.target.value)} placeholder="Passcode" type="password" className="h-11 rounded-[12px] border-2 border-ice bg-tile px-3 text-[14px] text-ink outline-none" />}
      </div>

      {/* right: the songs */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={label}>{style} · {d.vibe || "Classic"} · target {d.targetMin} min ({fmtClock(w.minSec)}–{fmtClock(w.maxSec)})</span>
          <span className="text-[26px] font-light leading-none">
            {d.songs.length} song{d.songs.length === 1 ? "" : "s"}{stateText && <> · <span className={stateColor}>{stateText}</span></>}
          </span>
          <span className="text-[14px] font-light text-mist">The ride is every song except the last, plus a 2:00 cool-down that starts as the last song starts. Stretching follows while it plays out.</span>
        </div>

        {d.songs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={p.onAuto} disabled={working || !needsFix} className="h-11 rounded-full border-2 border-ice px-5 text-[14px] font-medium text-ice disabled:opacity-40">{busy === "adjust" ? "Adjusting…" : "Auto-adjust length"}</button>
            <button onClick={p.onAdd} disabled={working} className={`${pill} disabled:opacity-40`}>{p.swapping === -1 ? "Adding…" : "+ Add a song"}</button>
            <button onClick={copy} disabled={!p.ready} className="h-11 rounded-full bg-ice px-5 text-[14px] font-medium text-ground disabled:opacity-40">Copy prompt + playlist</button>
            <button onClick={p.onNext} disabled={!p.ready} className={`${pill} ml-auto disabled:opacity-40`}>Plan the ride →</button>
          </div>
        )}
        {d.songs.length > 0 && (
          <div className="flex items-center gap-3">
            <input value={d.playlistUrl} onChange={(e) => patch({ playlistUrl: e.target.value })} onPaste={(e) => pasteLink(e, (v) => patch({ playlistUrl: v }))} onBlur={() => patch({ playlistUrl: extractUrl(d.playlistUrl) || d.playlistUrl.trim() })}
              placeholder="Playlist link from Amazon Music" inputMode="url" className="h-11 min-w-0 flex-1 rounded-[12px] border-2 border-line bg-tile px-3 text-[14px] text-ink outline-none focus:border-ice" />
            {isHttpUrl(extractUrl(d.playlistUrl) || d.playlistUrl.trim()) && (
              <a href={extractUrl(d.playlistUrl) || d.playlistUrl.trim()} target="_blank" rel="noopener noreferrer" className="flex h-11 flex-none items-center rounded-full bg-ice px-5 text-[14px] font-medium text-ground">Open playlist ↗</a>
            )}
          </div>
        )}
        {(p.doubtful > 0 || check.issues.some((i) => i.kind !== "missing")) && (
          <div className="flex flex-col gap-1">
            {p.doubtful > 0 && <p className="m-0 text-[14px] text-ice">{p.doubtful} song{p.doubtful === 1 ? "" : "s"} could be more than one version. Tap the right one below.</p>}
            {check.issues.filter((i) => i.kind !== "missing").map((i, k) => <p key={k} className="m-0 text-[14px] text-ice">{i.message}</p>)}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
          {!d.songs.length && busy === null && <div className="rounded-[16px] border-2 border-dashed border-line p-8 text-center text-[16px] text-mist">Name the playlist, pick a length and a style, then plan the songs. Real song lengths come from a music catalog and decide the ride.</div>}
          {d.songs.map((s, i) => (
            <SongRow key={s.key} s={s} i={i} total={d.songs.length} busy={working || p.swapping !== null} swapping={p.swapping === i}
              onSwap={() => p.onSwap(i)} onRemove={() => p.onRemove(i)} onLength={(sec) => p.onLength(i, sec)} onPick={(c) => p.onPick(i, c)} onLock={() => p.onLock(i)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SongRow({ s, i, total, busy, swapping, onSwap, onRemove, onLength, onPick, onLock }: {
  s: SongDraft; i: number; total: number; busy: boolean; swapping: boolean;
  onSwap: () => void; onRemove: () => void; onLength: (sec: number) => void; onPick: (c: SongCandidate) => void; onLock: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState("");
  const role = i === 0 ? "WARM-UP" : i === total - 1 ? "COOL-DOWN" : "";
  const src = s.durationSource === "typed" ? "typed" : s.status === "cached" ? "saved" : s.durationSource === "deezer" ? "catalog" : "";
  const commit = () => { const n = parseLen(text); if (n) onLength(n); setEdit(false); };
  const bad = s.status === "doubtful" || s.status === "missing";
  return (
    <div className="flex flex-none flex-col gap-2 rounded-[14px] bg-tile px-4 py-2" style={{ opacity: swapping ? 0.5 : 1 }}>
      <div className="flex h-14 items-center gap-3">
        <span className="w-6 flex-none text-center text-[15px] font-medium text-mist">{i + 1}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[16px] font-normal">{swapping ? "Finding a song…" : s.title}{role && <span className="ml-3 text-[14px] font-medium tracking-[.12em] text-ice">{role}</span>}</span>
          <span className="truncate text-[14px] font-light text-mist">{s.artist}{s.album ? ` · ${s.album}` : ""}{s.intensity ? ` · feels ${s.intensity}/10` : ""}</span>
        </div>
        {edit ? (
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEdit(false); }}
            placeholder="m:ss" inputMode="numeric" aria-label="Song length" className="h-11 w-[86px] rounded-[12px] border-2 border-ice bg-ground px-2 text-center text-[15px] text-ink outline-none" />
        ) : (
          <button onClick={() => { setText(s.durationSec ? fmtClock(s.durationSec) : ""); setEdit(true); }} aria-label="Edit song length"
            className={`flex h-11 min-w-[86px] flex-col items-center justify-center rounded-[12px] border-2 px-2 ${bad || s.durationSec === undefined ? "border-ice text-ice" : "border-line text-ink"}`}>
            <span className="text-[16px] leading-none">{s.status === "pending" ? "…" : s.durationSec ? fmtClock(s.durationSec) : "type it"}</span>
            {src && <span className="text-[14px] font-light leading-none text-mist">{src}</span>}
          </button>
        )}
        <a href={amazonSearchUrl(s)} target="_blank" rel="noreferrer" className="flex-none text-[14px] font-normal text-mist underline underline-offset-4">Amazon</a>
        <div className="flex flex-none gap-1">
          <Icon text={s.locked ? "Unlock song" : "Lock song"} on={onLock} active={s.locked}>{s.locked ? "●" : "○"}</Icon>
          <Icon text="Swap this song" disabled={busy || s.locked} on={onSwap}>⇄</Icon>
          <Icon text="Remove this song" disabled={busy || total <= 3} on={onRemove}>✕</Icon>
        </div>
      </div>
      {bad && (
        <div className="flex flex-wrap items-center gap-2 pb-1 pl-9">
          <span className="text-[14px] text-ice">{s.note || (s.status === "missing" ? "Not found in the catalog." : "More than one version.")}</span>
          {(s.candidates ?? []).map((c) => (
            <button key={c.id} onClick={() => onPick(c)} className="h-11 rounded-full border-2 border-ice px-4 text-[14px] text-ink">{fmtClock(c.durationSec)} · {c.album || "single"}</button>
          ))}
          {s.status === "missing" && <span className="text-[14px] font-light text-mist">Or tap the length and type it.</span>}
        </div>
      )}
    </div>
  );
}
