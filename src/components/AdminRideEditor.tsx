"use client";
import { useEffect, useState } from "react";
import PhoneShell from "./PhoneShell";
import ConfirmDialog from "./ConfirmDialog";
import { LogoMark, Wordmark } from "./Logo";
import { fmtClock } from "@/lib/format";
import { extractUrl, pasteLink } from "@/lib/url";
import { ACTIVE_SERVICES, SERVICE_LABEL, linkWarning, missingServices, type Service } from "@/lib/services";
import type { CuratedSummary } from "@/lib/db/curated";

type Form = { title: string; blurb: string; month: string; links: Record<Service, string> };
const formOf = (r: CuratedSummary): Form => ({ title: r.title, blurb: r.blurb ?? "", month: r.month ?? "", links: { spotify: r.links.spotify ?? "", apple: r.links.apple ?? "", amazon: r.links.amazon ?? "" } });

const input = "h-[48px] w-full min-w-0 rounded-[12px] border-2 border-line bg-tile px-3 text-[16px] text-ink outline-none focus:border-ice";
const label = "text-[14px] font-medium uppercase tracking-[.14em] text-mist";

/** Admin: one curated ride. Text, month, the playlist links, publish / unpublish, a new version, delete a draft. */
export default function AdminRideEditor({ id }: { id: string }) {
  const [ride, setRide] = useState<CuratedSummary | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<"delete" | "unpublish" | null>(null);

  useEffect(() => {
    fetch(`/api/admin/curated/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error ?? `Couldn't load (${r.status})`); setRide(b); setForm(formOf(b)); })
      .catch((e: Error) => setMsg({ text: e.message, ok: false }));
  }, [id]);

  const live = ride?.status === "published";
  const dirty = !!(ride && form && JSON.stringify(form) !== JSON.stringify(formOf(ride)));
  const missing = form ? missingServices(form.links) : [];

  /** Sends the form (and an optional status change), and shows the server's answer. The database's rules come back as plain text. */
  async function send(extra: { status?: "draft" | "published" } = {}, done = "Saved.") {
    if (!form) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/curated/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, blurb: form.blurb || null, month: form.month || null, links: form.links, ...extra }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? `Couldn't save (${res.status})`);
      setRide(b); setForm(formOf(b)); setMsg({ text: done, ok: true });
    } catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
    setBusy(false);
  }

  async function newVersion() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/curated", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ copyOf: id }) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? `Couldn't copy (${res.status})`);
      window.location.href = `/admin/rides/${b.id}`;
    } catch (e) { setMsg({ text: (e as Error).message, ok: false }); setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/curated/${encodeURIComponent(id)}`, { method: "DELETE" });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? `Couldn't delete (${res.status})`);
      window.location.href = "/admin/rides";
    } catch (e) { setMsg({ text: (e as Error).message, ok: false }); setAsk(null); setBusy(false); }
  }

  const setLink = (s: Service, v: string) => setForm((f) => (f ? { ...f, links: { ...f.links, [s]: v } } : f));

  return (
    <PhoneShell>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 pb-10">
        <div className="flex items-center justify-between gap-2">
          <a href="/" aria-label="RideDeck home" className="flex min-w-0 items-center gap-2"><LogoMark size={30} /><Wordmark size={18} /></a>
          <a href="/admin/rides" className="flex h-[40px] flex-none items-center rounded-full border-2 border-line px-3 text-[14px] text-ink">← Published rides</a>
        </div>
        {!form || !ride ? <p className="m-0 text-[14px] text-ice">{msg?.text ?? "Loading…"}</p> : (
          <>
            <div className="flex items-center gap-3">
              <h1 className="m-0 min-w-0 flex-1 truncate text-[24px] font-light">{ride.title}</h1>
              <span className={`flex-none rounded-full px-3 py-[2px] text-[14px] font-medium ${live ? "bg-ice text-ground" : "border-2 border-line text-ice"}`}>{live ? "Live" : "Draft"}</span>
            </div>
            <span className="text-[14px] font-light text-mist">{fmtClock(ride.totalSeconds)} · {live ? "Riders can see this ride." : "Only you can see this ride."}</span>

            <label className="flex flex-col gap-1"><span className={label}>Title</span>
              <input className={input} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className={label}>Description</span>
              <textarea className={`${input} h-[96px] py-2`} value={form.blurb} maxLength={600} placeholder="One or two lines riders see on the card" onChange={(e) => setForm({ ...form, blurb: e.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className={label}>Month (optional)</span>
              <input className={input} type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></label>

            <div className="flex flex-col gap-3 rounded-[18px] border-2 border-line bg-tile p-4">
              <span className={label}>Playlists, one for each service ({ACTIVE_SERVICES.map((s) => SERVICE_LABEL[s]).join(" and ")})</span>
              {ACTIVE_SERVICES.map((s) => {
                const warn = linkWarning(s, form.links[s]);
                return (
                  <label key={s} className="flex flex-col gap-1">
                    <span className="text-[14px] font-normal text-ink">{SERVICE_LABEL[s]} {form.links[s].trim() && !warn ? <span className="text-ice">✓</span> : null}</span>
                    <input className={input} inputMode="url" placeholder={`Paste the ${SERVICE_LABEL[s]} playlist link`} value={form.links[s]}
                      onChange={(e) => setLink(s, e.target.value)} onPaste={(e) => pasteLink(e, (v) => setLink(s, v))} onBlur={() => setLink(s, extractUrl(form.links[s]) || form.links[s].trim())} />
                    {warn && <span className="text-[14px] text-ice">{warn}</span>}
                  </label>
                );
              })}
              <span className="text-[14px] font-light text-mist">{missing.length ? `Still needed to publish: ${missing.map((m) => SERVICE_LABEL[m]).join(", ")}.` : "All the links are in."}</span>
            </div>

            {msg && <p className={`m-0 text-[14px] ${msg.ok ? "text-ice" : "text-ice"}`} role="status">{msg.ok ? "✓ " : "⚠ "}{msg.text}</p>}

            <div className="flex flex-wrap gap-3">
              <button onClick={() => send()} disabled={busy || !dirty} className="h-[52px] rounded-full bg-ice px-7 text-[16px] font-medium text-ground disabled:opacity-40">{busy ? "Working…" : dirty ? "Save changes" : "Saved"}</button>
              {!live && <button onClick={() => send({ status: "published" }, "Published. Riders can see it now.")} disabled={busy || missing.length > 0} className="h-[52px] rounded-full border-2 border-ice px-7 text-[16px] font-medium text-ice disabled:opacity-40">Publish</button>}
              {live && <button onClick={() => setAsk("unpublish")} disabled={busy} className="h-[52px] rounded-full border-2 border-line px-7 text-[16px] font-medium text-ink disabled:opacity-40">Unpublish</button>}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 pt-1">
              <a href={`/ride/${ride.id}`} className="flex h-[40px] items-center text-[14px] text-ice underline underline-offset-4">Test this ride</a>
              <a href={`/builder/${ride.id}`} className="flex h-[40px] items-center text-[14px] text-ice underline underline-offset-4">See the segments</a>
              <button onClick={newVersion} disabled={busy} className="flex h-[40px] items-center text-[14px] text-ice underline underline-offset-4">Make a new version</button>
              {!live && <button onClick={() => setAsk("delete")} disabled={busy} className="flex h-[40px] items-center text-[14px] text-mist underline underline-offset-4">Delete draft</button>}
            </div>
            <p className="m-0 text-[14px] font-light leading-snug text-mist">The segments are locked once a ride has been published, so riders' History always matches what they rode. To change them, make a new version: it copies the ride into a new draft.</p>
          </>
        )}
      </div>
      {ask === "delete" && <ConfirmDialog fixed title={`Delete "${ride?.title}"?`} body="This draft and its playlist links are removed. It can't be undone." busy={busy} onConfirm={remove} onCancel={() => setAsk(null)} />}
      {ask === "unpublish" && <ConfirmDialog fixed title="Unpublish this ride?" body="Riders stop seeing it in their library. Rides they already finished stay in their History." confirmLabel="Unpublish" busy={busy} onConfirm={async () => { setAsk(null); await send({ status: "draft" }, "Unpublished. Only you can see it now."); }} onCancel={() => setAsk(null)} />}
    </PhoneShell>
  );
}
