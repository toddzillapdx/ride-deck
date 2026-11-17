"use client";
import { useCallback, useEffect, useState } from "react";
import PhoneShell from "./PhoneShell";
import ConfirmDialog from "./ConfirmDialog";
import { LogoMark, Wordmark } from "./Logo";
import { inviteMessage, isActiveRider, suggestEmail, type ConsoleData, type ConsoleRider } from "@/lib/admin/console";
import { SERVICE_LABEL } from "@/lib/services";

type Tab = "requests" | "invited" | "riders" | "activity";
type Reply = { message: string; email?: { to: string; sent: boolean; reason?: string; detail?: string; mailto?: string } };

const btn = "flex h-[44px] items-center justify-center rounded-full px-5 text-[14px] font-medium disabled:opacity-40";
const solid = `${btn} bg-ice text-ground`;
const ghost = `${btn} border-2 border-line text-ink`;
const field = "h-[48px] w-full min-w-0 rounded-[12px] border-2 border-line bg-tile px-3 text-[16px] text-ink outline-none focus:border-ice";

/** "3 days ago", "today", "never" */
function ago(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`;
}

/** Admin console: invite requests, people invited who have not signed in, riders and their status, and what the admin did recently. */
export default function AdminConsole() {
  const [data, setData] = useState<ConsoleData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("requests");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Reply | null>(null);
  const [ask, setAsk] = useState<{ title: string; body: string; label: string; run: () => void } | null>(null);
  const [notify, setNotify] = useState(true);
  const [handled, setHandled] = useState(false);
  const [add, setAdd] = useState({ email: "", note: "" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/console", { cache: "no-store" });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? `Couldn't load (${res.status})`);
      setData(b); setError("");
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  /** One action. Shows what the server said; if an email could not be sent automatically, offers the fallback. */
  async function act(key: string, body: Record<string, unknown>, after?: () => void) {
    setBusy(key); setNotice(null);
    try {
      const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? `That didn't work (${res.status})`);
      setNotice(b); after?.();
      await load();
    } catch (e) { setNotice({ message: `⚠ ${(e as Error).message}` }); }
    setBusy(null);
  }

  const counts = data?.counts;
  const typo = suggestEmail(add.email);
  const tabs: [Tab, string, number | null][] = [["requests", "Requests", counts?.newRequests ?? null], ["invited", "Invited", counts?.waiting ?? null], ["riders", "Riders", data?.riders.length ?? null], ["activity", "Activity", null]];

  return (
    <PhoneShell>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 pb-10">
        <div className="flex items-center justify-between gap-2">
          <a href="/" aria-label="RideDeck home" className="flex min-w-0 items-center gap-2"><LogoMark size={30} /><Wordmark size={18} /></a>
          <a href="/" className="flex h-[40px] flex-none items-center rounded-full border-2 border-line px-3 text-[14px] text-ink">← Library</a>
        </div>
        <div className="flex items-end justify-between gap-3">
          <h1 className="m-0 text-[26px] font-light uppercase" style={{ letterSpacing: ".02em" }}>Admin</h1>
          <a href="/admin/rides" className="flex h-[40px] items-center rounded-full border-2 border-line px-4 text-[14px] text-ink">Published rides</a>
        </div>

        {data && (
          <div className="grid grid-cols-4 gap-2">
            {([["New", counts!.newRequests], ["Invited", counts!.waiting], ["Active", counts!.active], ["Disabled", counts!.disabled]] as [string, number][]).map(([l, n]) => (
              <div key={l} className="flex flex-col items-center rounded-[14px] border-2 border-line bg-tile py-2">
                <span className="num text-[26px] font-light">{n}</span><span className="text-[14px] font-light text-mist">{l}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1 rounded-full border-2 border-line p-1" role="tablist">
          {tabs.map(([t, label, n]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`h-[40px] min-w-0 flex-1 rounded-full text-[14px] font-medium ${tab === t ? "bg-ice text-ground" : "text-ink"}`}>
              {label}{n !== null ? ` ${n}` : ""}
            </button>
          ))}
        </div>

        {notice && (
          <div className="flex flex-col gap-2 rounded-[14px] border-2 border-ice px-4 py-3" role="status">
            <span className="text-[14px] text-ink">{notice.message}</span>
            {notice.email?.sent && <span className="text-[14px] text-ice">✓ Invitation email sent to {notice.email.to}.</span>}
            {notice.email && !notice.email.sent && (
              <div className="flex flex-col gap-2">
                <span className="text-[14px] text-mist">{notice.email.reason === "not-configured" ? "Automatic email isn't set up yet, so send the invitation yourself:" : `The email didn't go out${notice.email.detail ? ` (${notice.email.detail})` : ""}. Send it yourself:`}</span>
                <div className="flex flex-wrap gap-2">
                  <a href={notice.email.mailto} className={solid}>Open in my mail app</a>
                  <button className={ghost} onClick={() => navigator.clipboard?.writeText(inviteMessage().text)}>Copy the message</button>
                </div>
              </div>
            )}
            <button onClick={() => setNotice(null)} className="self-start text-[14px] text-mist underline underline-offset-4">Dismiss</button>
          </div>
        )}
        {error && <p className="m-0 text-[14px] text-ice">{error}</p>}
        {!data && !error && <p className="m-0 text-[14px] text-mist">Loading…</p>}

        {data && tab === "requests" && (
          <>
            <div className="flex flex-col gap-3 rounded-[18px] border-2 border-line bg-tile p-4">
              <span className="text-[16px] font-normal text-ink">Invite someone</span>
              <input className={field} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" placeholder="their email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} />
              {typo && <button onClick={() => setAdd({ ...add, email: typo })} className="self-start text-left text-[14px] text-ice underline underline-offset-4">Did you mean {typo}?</button>}
              <input className={field} placeholder="a note for yourself (optional)" value={add.note} maxLength={300} onChange={(e) => setAdd({ ...add, note: e.target.value })} />
              <button disabled={!add.email.trim() || busy !== null} className={solid} onClick={() => act("add", { action: "add_invite", email: add.email, note: add.note, notify }, () => setAdd({ email: "", note: "" }))}>{busy === "add" ? "Working…" : notify ? "Invite and email them" : "Invite"}</button>
            </div>
            <label className="flex items-center gap-3 text-[14px] text-ink"><input type="checkbox" className="h-5 w-5" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Email the invitation when I approve or invite {data.emailConfigured ? "" : "(you'll send it from your mail app)"}</label>

            <div className="flex flex-col gap-2">
              {data.requests.filter((r) => r.status === "new").length === 0 && <div className="rounded-[18px] border-2 border-dashed border-line p-5 text-center text-[14px] text-mist">No new requests.</div>}
              {data.requests.filter((r) => r.status === "new").map((r) => (
                <div key={r.email} className="flex flex-col gap-2 rounded-[16px] border-2 border-line bg-tile px-4 py-3">
                  <span className="break-all text-[16px] text-ink">{r.email}</span>
                  {r.suggestion && <span className="text-[14px] text-ice">Looks like a typo. Did you mean {r.suggestion}?</span>}
                  {r.note && <span className="text-[14px] font-light text-ice">“{r.note}”</span>}
                  <span className="text-[14px] font-light text-mist">Asked {ago(r.createdAt)}</span>
                  <div className="flex gap-2">
                    <button disabled={busy !== null} className={solid} onClick={() => act(`a-${r.email}`, { action: "approve_request", email: r.email, notify })}>{busy === `a-${r.email}` ? "Working…" : "Approve"}</button>
                    <button disabled={busy !== null} className={ghost} onClick={() => act(`d-${r.email}`, { action: "decline_request", email: r.email })}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
            {data.requests.some((r) => r.status !== "new") && (
              <button onClick={() => setHandled(!handled)} className="self-start text-[14px] text-mist underline underline-offset-4">{handled ? "Hide" : "Show"} handled requests ({data.requests.filter((r) => r.status !== "new").length})</button>
            )}
            {handled && data.requests.filter((r) => r.status !== "new").map((r) => (
              <div key={r.email} className="flex items-center gap-3 rounded-[14px] border-2 border-line px-4 py-2">
                <div className="flex min-w-0 flex-1 flex-col"><span className="break-all text-[14px] text-ink">{r.email}</span><span className="text-[14px] font-light text-mist">{r.status === "invited" ? "Approved" : "Declined"} · asked {ago(r.createdAt)}</span></div>
                {r.status === "declined" && <button disabled={busy !== null} className={ghost} onClick={() => act(`r-${r.email}`, { action: "reopen_request", email: r.email })}>Reopen</button>}
              </div>
            ))}
          </>
        )}

        {data && tab === "invited" && (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[14px] font-light text-mist">Invited, but they haven't signed in yet.</p>
            {data.invites.length === 0 && <div className="rounded-[18px] border-2 border-dashed border-line p-5 text-center text-[14px] text-mist">Nobody is waiting.</div>}
            {data.invites.map((i) => (
              <div key={i.email} className="flex flex-col gap-2 rounded-[16px] border-2 border-line bg-tile px-4 py-3">
                <span className="break-all text-[16px] text-ink">{i.email}</span>
                {i.suggestion && <span className="text-[14px] text-ice">Looks like a typo. Did you mean {i.suggestion}? Remove this one and invite the right address.</span>}
                <span className="text-[14px] font-light text-mist">Invited {ago(i.createdAt)}{i.note ? ` · ${i.note}` : ""}</span>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy !== null} className={solid} onClick={() => act(`s-${i.email}`, { action: "send_invite_email", email: i.email })}>{busy === `s-${i.email}` ? "Working…" : "Send email"}</button>
                  <button disabled={busy !== null} className={ghost} onClick={() => setAsk({ title: `Remove ${i.email}?`, body: "They'll no longer be able to sign up. You can invite them again later.", label: "Remove", run: () => act(`x-${i.email}`, { action: "remove_invite", email: i.email }) })}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {data && tab === "riders" && (
          <div className="flex flex-col gap-2">
            {data.ridersTruncated && <p className="m-0 text-[14px] text-ice">Showing the first 1,000 accounts.</p>}
            {data.riders.map((r) => <RiderCard key={r.id} r={r} busy={busy}
              onToggle={() => r.disabled ? act(`t-${r.id}`, { action: "enable_rider", userId: r.id })
                : setAsk({ title: `Disable ${r.email}?`, body: "They won't be able to sign in until you enable them again. Their rides and history are kept.", label: "Disable", run: () => act(`t-${r.id}`, { action: "disable_rider", userId: r.id }) })} />)}
          </div>
        )}

        {data && tab === "activity" && (
          <div className="flex flex-col gap-2">
            {data.log.length === 0 && <div className="rounded-[18px] border-2 border-dashed border-line p-5 text-center text-[14px] text-mist">Nothing yet. What you do here shows up in this list.</div>}
            {data.log.map((l, i) => (
              <div key={i} className="flex flex-col rounded-[14px] border-2 border-line px-4 py-2">
                <span className="text-[14px] text-ink"><b className="font-medium">{l.action}</b> · <span className="break-all">{l.target}</span></span>
                <span className="text-[14px] font-light text-mist">{ago(l.at)}{l.detail ? ` · ${l.detail}` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {ask && <ConfirmDialog fixed title={ask.title} body={ask.body} confirmLabel={ask.label} onConfirm={() => { const r = ask.run; setAsk(null); r(); }} onCancel={() => setAsk(null)} />}
    </PhoneShell>
  );
}

function RiderCard({ r, busy, onToggle }: { r: ConsoleRider; busy: string | null; onToggle: () => void }) {
  const state = r.disabled ? "Disabled" : isActiveRider(r) ? "Active" : "Quiet";
  return (
    <div className="flex flex-col gap-2 rounded-[16px] border-2 border-line bg-tile px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 break-all text-[16px] text-ink">{r.email}</span>
        <span className={`flex-none rounded-full px-3 py-[2px] text-[14px] font-medium ${state === "Active" ? "bg-ice text-ground" : state === "Disabled" ? "border-2 border-ice text-ice" : "border-2 border-line text-mist"}`}>{state}</span>
      </div>
      <span className="text-[14px] font-light text-mist">
        Joined {ago(r.joinedAt)} · last ride {ago(r.lastRideAt)} · {r.rideCount} ride{r.rideCount === 1 ? "" : "s"} · {r.service ? SERVICE_LABEL[r.service] : "no service chosen"}
      </span>
      {(r.isAdmin || r.isYou) && <span className="text-[14px] text-ice">{r.isAdmin ? "Admin" : ""}{r.isAdmin && r.isYou ? " · " : ""}{r.isYou ? "You" : ""}</span>}
      {!r.isAdmin && !r.isYou && (
        <div className="flex flex-wrap gap-2">
          <button disabled={busy !== null} className={r.disabled ? solid : ghost} onClick={onToggle}>{r.disabled ? "Enable" : "Disable"}</button>
        </div>
      )}
    </div>
  );
}
