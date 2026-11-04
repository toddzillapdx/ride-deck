"use client";
import { useCallback, useEffect, useState } from "react";
import Stage from "./Stage";
import PhoneShell from "./PhoneShell";
import ConfirmDialog from "./ConfirmDialog";
import { useHiddenPresets } from "@/lib/hiddenPresets";
import { useLayout } from "@/lib/useLayout";
import { PRESETS, isPresetId, totalSeconds } from "@/lib/presets";
import { fmtClock } from "@/lib/format";
import { parseWorkout } from "@/lib/validate";
import type { Workout } from "@/lib/types";

type Modal = { kind: "export"; workout: Workout } | { kind: "import" } | null;

function exportJson(w: Workout): string {
  const { id: _id, ...rest } = w;
  return JSON.stringify(rest, null, 2);
}

export default function Library() {
  const [saved, setSaved] = useState<Workout[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "off" | "error">("loading");
  const [detail, setDetail] = useState("");
  const [modal, setModal] = useState<Modal>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/rides", { cache: "no-store" });
      const body = await res.json();
      if (!body.configured) setStatus("off");
      else if (!res.ok) { setStatus("error"); setDetail(body.error ?? ""); }
      else { setSaved(body.rides); setStatus("ok"); }
    } catch (e) {
      setStatus("error");
      setDetail((e as Error).message);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const layout = useLayout();
  const layoutPhone = layout?.phone;

  // Deleting: your own rides are removed from Airtable; the built-in starter rides are hidden (and can be restored).
  const { hidden, hide, restoreAll } = useHiddenPresets();
  const [ask, setAsk] = useState<{ w: Workout; mine: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const visiblePresets = PRESETS.filter((p) => !hidden.includes(p.id));

  const confirmDelete = async () => {
    if (!ask) return;
    setBusy(true); setNotice("");
    try {
      if (ask.mine) {
        const res = await fetch(`/api/rides/${ask.w.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed");
        setSaved((s) => s.filter((x) => x.id !== ask.w.id));
      } else {
        await hide(ask.w.id);
      }
    } catch (e) {
      setNotice((e as Error).message);
    }
    setAsk(null);
    setBusy(false);
  };
  const restore = () => restoreAll().catch((e: Error) => setNotice(e.message));
  const dialog = ask && (
    <ConfirmDialog
      fixed={!!layoutPhone}
      title={ask.mine ? `Delete "${ask.w.name}"?` : `Remove "${ask.w.name}"?`}
      body={ask.mine
        ? "This deletes the ride from your library and can't be undone. Rides you've already finished stay in History."
        : "It disappears from the library and the music planner, on every device. You can bring the starter rides back any time with Restore starter rides."}
      confirmLabel={ask.mine ? "Delete" : "Remove"}
      busy={busy}
      onConfirm={confirmDelete}
      onCancel={() => setAsk(null)}
    />
  );

  const [hint, setHint] = useState(false);
  useEffect(() => {
    try {
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      setHint(!standalone && localStorage.getItem("ridedeck-hint-dismissed") !== "1");
    } catch { /* ignore */ }
  }, []);

  if (layout === null) return <div className="fixed inset-0" style={{ background: "#002A33" }} />;
  if (layout.phone) {
    const all = [...saved.map((w) => ({ w, mine: true })), ...visiblePresets.map((w) => ({ w, mine: false }))];
    return (
      <PhoneShell>
        <div className="flex items-end justify-between gap-3 pb-4">
          <div className="flex flex-col gap-1">
            <span className="text-[28px] font-light uppercase leading-none" style={{ letterSpacing: ".02em" }}>RideDeck</span>
            <span className="text-[10px] font-medium uppercase tracking-[.16em] text-mist">{status === "ok" ? "Airtable connected" : status === "loading" ? "Loading…" : status === "off" ? "Presets only" : "Airtable error"}</span>
          </div>
          <a href="/history" className="flex h-[48px] items-center rounded-full border-2 border-line px-5 text-[14px] text-ink">History</a>
        </div>
        <div className={`grid gap-3 ${layout.landscape ? "grid-cols-2" : "grid-cols-1"}`}>
          {all.map(({ w, mine }) => {
            const climbs = w.segments.filter((x) => x.type === "climb").length;
            const sprints = w.segments.filter((x) => x.type === "sprint").length;
            return (
              <div key={w.id} className="flex items-center gap-3 rounded-[18px] border-2 border-line bg-tile px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[17px] font-normal">{w.name}</span>
                  <span className="text-[12px] font-light leading-snug text-mist">
                    {mine ? "Mine · " : ""}{fmtClock(totalSeconds(w))} · {w.segments.length} segment{w.segments.length === 1 ? "" : "s"}{climbs ? ` · ${climbs} climb${climbs > 1 ? "s" : ""}` : ""}{sprints ? ` · ${sprints} sprint${sprints > 1 ? "s" : ""}` : ""}
                  </span>
                  <div className="flex items-center gap-5">
                    {w.playlistUrl && <a href={w.playlistUrl} target="_blank" rel="noopener noreferrer" className="flex h-[44px] items-center text-[13px] text-ice underline underline-offset-4">Playlist ↗</a>}
                    <button onClick={() => setAsk({ w, mine })} className="flex h-[44px] items-center px-1 text-[13px] text-mist underline underline-offset-4">{mine ? "Delete" : "Remove"}</button>
                  </div>
                </div>
                <a href={`/ride/${w.id}`} className="flex h-[52px] flex-none items-center rounded-full bg-ice px-7 text-[16px] font-medium text-ground">Start</a>
              </div>
            );
          })}
        </div>
        {all.length === 0 && (
          <div className="rounded-[18px] border-2 border-dashed border-line p-6 text-center text-[14px] text-mist">No rides yet. Build one on a computer, or restore the starter rides.</div>
        )}
        {notice && <p className="pt-3 text-center text-[13px] text-ice">{notice}</p>}
        {hidden.length > 0 && (
          <button onClick={restore} className="mt-4 flex h-[44px] w-full items-center justify-center text-[13px] text-mist underline underline-offset-4">Restore starter rides ({hidden.length} removed)</button>
        )}
        {hint && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-[14px] border-2 border-line px-4 py-3 text-[12px] font-light text-mist">
            <span>Tip: tap Share, then Add to Home Screen, to open RideDeck full screen without the browser bar.</span>
            <button className="flex-none text-ice underline underline-offset-4" onClick={() => { try { localStorage.setItem("ridedeck-hint-dismissed", "1"); } catch { /* ignore */ } setHint(false); }}>Got it</button>
          </div>
        )}
        <p className="pt-4 text-center text-[11px] font-light text-mist">Build rides and plan music on a computer.</p>
        {dialog}
      </PhoneShell>
    );
  }

  const statusText = { loading: "Loading saved rides…", ok: "Airtable connected", off: "Airtable not configured · presets only", error: `Airtable error${detail ? `: ${detail.slice(0, 80)}` : ""}` }[status];

  return (
    <Stage bg="#002A33">
      <div className="flex h-full flex-col gap-6 bg-ground text-ink" style={{ padding: "36px 56px 40px", boxSizing: "border-box" }}>
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-2">
            <span className="text-[34px] font-light uppercase leading-none" style={{ letterSpacing: ".02em" }}>RideDeck</span>
            <span className={`text-[13px] font-medium uppercase tracking-[.18em] ${status === "error" ? "text-ice" : "text-mist"}`}>{statusText}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setModal({ kind: "import" })} className="h-[44px] rounded-full border-2 border-line px-5 text-[14px] font-normal text-ink">
              Import JSON
            </button>
            <a href="/history" className="flex h-[44px] items-center rounded-full border-2 border-line px-5 text-[14px] font-normal text-ink">History</a>
            <a href="/music" className="flex h-[44px] items-center rounded-full border-2 border-line px-5 text-[14px] font-normal text-ink">Plan music</a>
            <a href="/builder/new" className="flex h-[44px] items-center rounded-full bg-ice px-6 text-[14px] font-medium text-ground">New ride</a>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
          {saved.length > 0 && (
            <Section label="My rides">
              {saved.map((w) => <Card key={w.id} w={w} mine onExport={() => setModal({ kind: "export", workout: w })} onDelete={() => setAsk({ w, mine: true })} />)}
            </Section>
          )}
          {visiblePresets.length > 0 && (
            <Section label="Starter rides">
              {visiblePresets.map((w) => <Card key={w.id} w={w} onExport={() => setModal({ kind: "export", workout: w })} onDelete={() => setAsk({ w, mine: false })} />)}
            </Section>
          )}
          {saved.length === 0 && visiblePresets.length === 0 && (
            <div className="rounded-[20px] border-2 border-dashed border-line p-10 text-center text-[18px] text-mist">No rides yet. Tap New ride to build one, or restore the starter rides.</div>
          )}
          {notice && <p className="pb-3 text-[14px] text-ice">{notice}</p>}
          {hidden.length > 0 && (
            <button onClick={restore} className="pb-2 text-[13px] text-mist underline underline-offset-4">Restore starter rides ({hidden.length} removed)</button>
          )}
        </div>
      </div>

      {dialog}
      {modal && <JsonModal modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} canSave={status === "ok"} />}
    </Stage>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      <span className="text-[12px] font-medium uppercase tracking-[.2em] text-mist">{label}</span>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Card({ w, mine, onExport, onDelete }: { w: Workout; mine?: boolean; onExport: () => void; onDelete: () => void }) {
  const climbs = w.segments.filter((s) => s.type === "climb").length;
  const sprints = w.segments.filter((s) => s.type === "sprint").length;
  return (
    <div className="flex items-center gap-4 rounded-[20px] border-2 border-line bg-tile px-6 py-5">
      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <span className="truncate text-[20px] font-normal">{w.name}</span>
        <span className="truncate text-[14px] font-light text-mist">
          {fmtClock(totalSeconds(w))} · {w.segments.length} segment{w.segments.length === 1 ? "" : "s"}{climbs ? ` · ${climbs} climb${climbs > 1 ? "s" : ""}` : ""}{sprints ? ` · ${sprints} sprint${sprints > 1 ? "s" : ""}` : ""}
        </span>
        <span className="flex gap-4 text-[13px] font-normal text-mist">
          {mine && !isPresetId(w.id) && <a href={`/builder/${w.id}`} className="underline underline-offset-4">Edit</a>}
          <a href={`/builder/new?from=${w.id}`} className="underline underline-offset-4">Duplicate</a>
          <a href={`/music?ride=${w.id}`} className="underline underline-offset-4">Music</a>
          {w.playlistUrl && <a href={w.playlistUrl} target="_blank" rel="noopener noreferrer" className="text-ice underline underline-offset-4">Playlist ↗</a>}
          <button onClick={onExport} className="underline underline-offset-4">Export</button>
          <button onClick={onDelete} className="underline underline-offset-4">{mine ? "Delete" : "Remove"}</button>
        </span>
      </div>
      <a href={`/ride/${w.id}`} className="flex h-[60px] items-center rounded-full bg-ice px-7 text-[16px] font-medium text-ground">Start</a>
    </div>
  );
}

function JsonModal({ modal, onClose, onSaved, canSave }: { modal: NonNullable<Modal>; onClose: () => void; onSaved: () => void; canSave: boolean }) {
  const isExport = modal.kind === "export";
  const [text, setText] = useState(isExport ? exportJson(modal.workout) : "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg("Copied"); }
    catch { setMsg("Couldn't copy. Select the text and copy it manually."); }
  };

  const save = async () => {
    setMsg("");
    let parsed;
    try { parsed = parseWorkout(JSON.parse(text)); } catch (e) { setMsg(e instanceof SyntaxError ? "That isn't valid JSON" : (e as Error).message); return; }
    setBusy(true);
    const res = await fetch("/api/rides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
    setBusy(false);
    if (res.ok) onSaved();
    else setMsg((await res.json().catch(() => ({}))).error ?? `Save failed (${res.status})`);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ground/90">
      <div className="flex flex-col gap-4 rounded-[28px] border-2 border-line bg-tile p-8" style={{ width: 860, height: 640 }}>
        <span className="text-[13px] font-medium uppercase tracking-[.2em] text-mist">{isExport ? `Export · ${modal.workout.name}` : "Import workout JSON"}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={isExport}
          spellCheck={false}
          placeholder={isExport ? "" : "Paste a workout here (see section 4 of the brief for the format)"}
          className="min-h-0 flex-1 resize-none rounded-[14px] border-2 border-line bg-ground p-4 font-mono text-[13px] text-ink outline-none"
          style={{ userSelect: "text" }}
        />
        <div className="flex items-center gap-3">
          <span className="flex-1 text-[14px] text-ice">{msg}</span>
          <button onClick={onClose} className="h-[48px] rounded-full border-2 border-line px-6 text-[15px] text-ink">Close</button>
          {isExport ? (
            <button onClick={copy} className="h-[48px] rounded-full bg-ice px-7 text-[15px] font-medium text-ground">Copy</button>
          ) : (
            <button onClick={save} disabled={busy || !canSave || !text.trim()} className="h-[48px] rounded-full bg-ice px-7 text-[15px] font-medium text-ground disabled:opacity-40">
              {canSave ? (busy ? "Saving…" : "Save to library") : "Airtable not connected"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
