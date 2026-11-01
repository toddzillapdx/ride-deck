"use client";
import { useCallback, useEffect, useState } from "react";
import Stage from "./Stage";
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

  const remove = async (w: Workout) => {
    if (!window.confirm(`Delete "${w.name}"?`)) return;
    const res = await fetch(`/api/rides/${w.id}`, { method: "DELETE" });
    if (res.ok) setSaved((s) => s.filter((x) => x.id !== w.id));
    else window.alert((await res.json().catch(() => ({}))).error ?? "Delete failed");
  };

  const statusText = { loading: "Loading saved rides…", ok: "Airtable connected", off: "Airtable not configured · presets only", error: `Airtable error${detail ? `: ${detail.slice(0, 80)}` : ""}` }[status];

  return (
    <Stage bg="#002A33">
      <div className="flex h-full flex-col gap-6 bg-ground text-ink" style={{ padding: "36px 56px 40px", boxSizing: "border-box" }}>
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-2">
            <span className="text-[34px] font-light uppercase leading-none" style={{ letterSpacing: ".02em" }}>RideDeck</span>
            <span className={`text-[13px] font-medium uppercase tracking-[.18em] ${status === "error" ? "text-ice" : "text-mist"}`}>{statusText}</span>
          </div>
          <button onClick={() => setModal({ kind: "import" })} className="h-[44px] rounded-full border-2 border-line px-5 text-[14px] font-normal text-ink">
            Import JSON
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
          {saved.length > 0 && (
            <Section label="My rides">
              {saved.map((w) => <Card key={w.id} w={w} onExport={() => setModal({ kind: "export", workout: w })} onDelete={() => remove(w)} />)}
            </Section>
          )}
          <Section label="Presets">
            {PRESETS.map((w) => <Card key={w.id} w={w} onExport={() => setModal({ kind: "export", workout: w })} />)}
          </Section>
        </div>
      </div>

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

function Card({ w, onExport, onDelete }: { w: Workout; onExport: () => void; onDelete?: () => void }) {
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
          <button onClick={onExport} className="underline underline-offset-4">Export</button>
          {onDelete && !isPresetId(w.id) && <button onClick={onDelete} className="underline underline-offset-4">Delete</button>}
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
