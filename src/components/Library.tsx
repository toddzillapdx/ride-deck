"use client";
import AccountMenu from "./AccountMenu";
import { LogoMark, Wordmark } from "./Logo";
import { useAdmin } from "@/lib/useAdmin";
import { useCallback, useEffect, useState } from "react";
import Stage from "./Stage";
import PhoneShell from "./PhoneShell";
import ConfirmDialog from "./ConfirmDialog";
import ServicePicker from "./ServicePicker";
import { isCuratedId } from "@/lib/curatedIds";
import { trackEvent } from "@/lib/events";
import { SERVICE_LABEL, type Service } from "@/lib/services";
import type { PublishedRide } from "@/lib/db/curated";
import { useLayout } from "@/lib/useLayout";
import { totalSeconds } from "@/lib/presets";
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
  const [published, setPublished] = useState<PublishedRide[]>([]);
  const [service, setService] = useState<Service | null>(null);
  const [changing, setChanging] = useState(false);
  const [status, setStatus] = useState<"loading" | "ok" | "off" | "error">("loading");
  const [detail, setDetail] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  /** Set when someone arrives from an invitation to a particular ride: after they choose a music service, that ride opens. */
  const [forRide, setForRide] = useState<string | null>(null);
  useEffect(() => { const r = new URLSearchParams(window.location.search).get("ride"); setForRide(r && isCuratedId(r) ? r : null); }, []);

  const refresh = useCallback(async () => {
    try {
      const [res, pub] = await Promise.all([fetch("/api/rides", { cache: "no-store" }), fetch("/api/curated", { cache: "no-store" })]);
      const body = await res.json();
      const pubBody = await pub.json().catch(() => ({ rides: [] }));
      if (pub.ok) { setPublished(pubBody.rides ?? []); setService(pubBody.service ?? null); }
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
  const admin = useAdmin();
  const layoutPhone = layout?.phone;

  // Deleting: your own (admin) rides are removed from the database. Published rides are managed under Admin.
  const [ask, setAsk] = useState<Workout | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const confirmDelete = async () => {
    if (!ask) return;
    setBusy(true); setNotice("");
    try {
      const res = await fetch(`/api/rides/${ask.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed");
      setSaved((x) => x.filter((r) => r.id !== ask.id));
    } catch (e) {
      setNotice((e as Error).message);
    }
    setAsk(null);
    setBusy(false);
  };
  const dialog = ask && (
    <ConfirmDialog
      fixed={!!layoutPhone}
      title={`Delete "${ask.name}"?`}
      body="This deletes the ride from your library and can't be undone. Rides you've already finished stay in History."
      confirmLabel="Delete"
      busy={busy}
      onConfirm={confirmDelete}
      onCancel={() => setAsk(null)}
    />
  );

  /** The rider's music service: asked once (the picker), then a small line to change it. */
  const serviceBlock = status === "ok" && (
    service === null || changing
      ? <ServicePicker value={service} intro={service === null} note={service === null && forRide ? "Your ride is ready. Choose your music service and it opens." : undefined}
        onChange={(sv) => { if (forRide) { window.location.href = `/ride/${forRide}`; return; } setService(sv); setChanging(false); refresh(); }} />
      : <button onClick={() => setChanging(true)} className="flex h-[36px] items-center gap-2 text-[14px] font-light text-mist">Music: <span className="text-ice">{SERVICE_LABEL[service]}</span> <span className="underline underline-offset-4">Change</span></button>
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
    return (
      <PhoneShell>
        <div className="flex items-center justify-between gap-2 pb-3">
          <a href="/" aria-label="RideDeck home" className="flex min-w-0 items-center gap-2"><LogoMark size={30} /><Wordmark size={18} /></a>
          <div className="flex flex-none items-center gap-1.5"><AccountMenu className="h-[40px] !px-3" /><a href="/history" className="flex h-[40px] items-center rounded-full border-2 border-line px-3 text-[14px] text-ink">History</a></div>
        </div>
        {serviceBlock && <div className="pb-3">{serviceBlock}</div>}
        {admin === true && <a href="/admin" className="mb-3 flex h-[44px] items-center justify-center rounded-full border-2 border-line text-[14px] text-ink">Admin</a>}
        <div className={`grid gap-2 ${layout.landscape ? "grid-cols-2" : "grid-cols-1"}`}>
          {published.map((r) => <PublishedCard key={r.id} r={r} service={service} phone />)}
          {saved.map((w) => {
            const climbs = w.segments.filter((x) => x.type === "climb").length;
            const sprints = w.segments.filter((x) => x.type === "sprint").length;
            return (
              <div key={w.id} className="flex items-center gap-3 rounded-[16px] border-2 border-dashed border-line bg-tile px-3.5 py-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[16px] font-normal">{w.name}</span>
                  <span className="text-[13px] font-light leading-snug text-mist">
                    My draft · {fmtClock(totalSeconds(w))} · {w.segments.length} segment{w.segments.length === 1 ? "" : "s"}{climbs ? ` · ${climbs} climb${climbs > 1 ? "s" : ""}` : ""}{sprints ? ` · ${sprints} sprint${sprints > 1 ? "s" : ""}` : ""}
                  </span>
                  <div className="flex items-center gap-4">
                    <a href={`/builder/${w.id}`} className="flex h-[32px] items-center text-[14px] text-ice underline underline-offset-4">Details</a>
                    <button onClick={() => setAsk(w)} className="flex h-[32px] items-center text-[14px] text-mist underline underline-offset-4">Delete</button>
                  </div>
                </div>
                <a href={`/ride/${w.id}`} className="flex h-[46px] flex-none items-center rounded-full bg-ice px-6 text-[16px] font-medium text-ground">Start</a>
              </div>
            );
          })}
        </div>
        {published.length === 0 && saved.length === 0 && (
          <div className="rounded-[18px] border-2 border-dashed border-line p-6 text-center text-[14px] text-mist">{admin === true ? "No rides yet. Build one on a computer, then publish it." : "No rides yet. New rides are coming soon."}</div>
        )}
        {notice && <p className="pt-3 text-center text-[13px] text-ice">{notice}</p>}
        {hint && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-[14px] border-2 border-line px-4 py-3 text-[12px] font-light text-mist">
            <span>Tip: tap Share, then Add to Home Screen, to open RideDeck full screen without the browser bar.</span>
            <button className="flex-none text-ice underline underline-offset-4" onClick={() => { try { localStorage.setItem("ridedeck-hint-dismissed", "1"); } catch { /* ignore */ } setHint(false); }}>Got it</button>
          </div>
        )}
        <p className="pt-3 text-center text-[12px] font-light text-mist">{admin === true && <>Build rides and plan music on a computer.<br /></>}{status === "ok" ? "Database connected" : status === "loading" ? "Loading…" : status === "off" ? "Presets only" : "Database error"}</p>
        {dialog}
      </PhoneShell>
    );
  }

  const statusText = { loading: "Loading saved rides…", ok: "Database connected", off: "Database not configured · presets only", error: `Database error${detail ? `: ${detail.slice(0, 80)}` : ""}` }[status];

  return (
    <Stage bg="#002A33">
      <div className="flex h-full flex-col gap-6 bg-ground text-ink" style={{ padding: "36px 56px 40px", boxSizing: "border-box" }}>
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4"><LogoMark size={48} /><Wordmark size={30} /></div>
            <span className={`text-[13px] font-medium uppercase tracking-[.18em] ${status === "error" ? "text-ice" : "text-mist"}`}>{statusText}</span>
          </div>
          <div className="flex gap-3">
            {admin === true && <button onClick={() => setModal({ kind: "import" })} className="h-[44px] rounded-full border-2 border-line px-5 text-[14px] font-normal text-ink">
              Import JSON
            </button>}
            <AccountMenu className="h-[44px]" />
            <a href="/history" className="flex h-[44px] items-center rounded-full border-2 border-line px-5 text-[14px] font-normal text-ink">History</a>
            {admin === true && <a href="/admin" className="flex h-[44px] items-center rounded-full border-2 border-line px-5 text-[14px] font-normal text-ink">Admin</a>}
            {admin === true && <a href="/builder/new" className="flex h-[44px] items-center rounded-full bg-ice px-6 text-[14px] font-medium text-ground">New ride</a>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
          {serviceBlock && <div className="mb-5 max-w-[560px]">{serviceBlock}</div>}
          {published.length > 0 && (
            <Section label="Rides">
              {published.map((r) => <PublishedCard key={r.id} r={r} service={service} />)}
            </Section>
          )}
          {saved.length > 0 && (
            <Section label="My drafts">
              {saved.map((w) => <Card key={w.id} w={w} admin={admin === true} onExport={() => setModal({ kind: "export", workout: w })} onDelete={() => setAsk(w)} />)}
            </Section>
          )}
          {saved.length === 0 && published.length === 0 && (
            <div className="rounded-[20px] border-2 border-dashed border-line p-10 text-center text-[18px] text-mist">{admin === true ? "No rides yet. Tap New ride to build one, then publish it." : "No rides yet. New rides are coming soon."}</div>
          )}
          {notice && <p className="pb-3 text-[14px] text-ice">{notice}</p>}
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

function Card({ w, admin, onExport, onDelete }: { w: Workout; admin: boolean; onExport: () => void; onDelete: () => void }) {
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
          <a href={`/builder/${w.id}`} className="underline underline-offset-4">Details</a>
          {admin && <a href={`/builder/new?from=${w.id}`} className="underline underline-offset-4">Duplicate to edit</a>}
          {w.playlistUrl && <a href={w.playlistUrl} target="_blank" rel="noopener noreferrer" className="text-ice underline underline-offset-4">Playlist ↗</a>}
          <button onClick={onExport} className="underline underline-offset-4">Export</button>
          <button onClick={onDelete} className="underline underline-offset-4">Delete</button>
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
              {canSave ? (busy ? "Saving…" : "Save to library") : "Database not connected"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** "2027-01" -> "January 2027" */
function monthLabel(m: string | null): string {
  const hit = m?.match(/^(\d{4})-(\d{2})$/);
  return hit ? new Date(Number(hit[1]), Number(hit[2]) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }) : "";
}

/** A published ride. Start needs the rider's music service (the playlist opens there), so until it is chosen the card says so. */
function PublishedCard({ r, service, phone = false }: { r: PublishedRide; service: Service | null; phone?: boolean }) {
  const w = r.workout;
  const month = monthLabel(r.month);
  const link = w.playlistUrl;
  return (
    <div className={`flex items-center gap-3 rounded-[16px] border-2 border-line bg-tile ${phone ? "px-3.5 py-2.5" : "gap-4 rounded-[20px] px-6 py-5"}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`truncate font-normal ${phone ? "text-[16px]" : "text-[20px]"}`}>{r.title}</span>
        <span className="text-[13px] font-light leading-snug text-mist">{month ? `${month} · ` : ""}{fmtClock(totalSeconds(w))} · {w.segments.length} segment{w.segments.length === 1 ? "" : "s"}</span>
        {r.blurb && <span className="text-[14px] font-light leading-snug text-ice" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.blurb}</span>}
        <div className="flex items-center gap-4">
          <a href={`/builder/${r.id}`} className="flex h-[32px] items-center text-[14px] text-mist underline underline-offset-4">Details</a>
          {link && <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent(r.id, "playlist_opened")} className="flex h-[32px] items-center text-[14px] text-ice underline underline-offset-4">Playlist ↗</a>}
        </div>
      </div>
      {service
        ? <a href={`/ride/${r.id}`} className={`flex flex-none items-center rounded-full bg-ice font-medium text-ground ${phone ? "h-[46px] px-6 text-[16px]" : "h-[60px] px-7 text-[16px]"}`}>Start</a>
        : <span className="max-w-[96px] flex-none text-center text-[13px] leading-snug text-mist">Choose your music service first</span>}
    </div>
  );
}
