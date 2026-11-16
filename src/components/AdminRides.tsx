"use client";
import { useEffect, useState } from "react";
import PhoneShell from "./PhoneShell";
import { LogoMark, Wordmark } from "./Logo";
import { fmtClock } from "@/lib/format";
import { SERVICE_LABEL } from "@/lib/services";
import type { CuratedSummary } from "@/lib/db/curated";

/** Admin: every curated ride, drafts and live, with what each is still missing. */
export default function AdminRides() {
  const [rides, setRides] = useState<CuratedSummary[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/admin/curated", { cache: "no-store" }).then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error ?? `Couldn't load (${r.status})`); setRides(b.rides); }).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <PhoneShell>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 pb-8">
        <div className="flex items-center justify-between gap-2">
          <a href="/" aria-label="RideDeck home" className="flex min-w-0 items-center gap-2"><LogoMark size={30} /><Wordmark size={18} /></a>
          <a href="/" className="flex h-[40px] flex-none items-center rounded-full border-2 border-line px-3 text-[14px] text-ink">← Library</a>
        </div>
        <h1 className="m-0 text-[26px] font-light uppercase" style={{ letterSpacing: ".02em" }}>Published rides</h1>
        <p className="m-0 text-[14px] font-light leading-snug text-mist">A ride goes live only when it has a playlist link for Spotify, Apple Music and Amazon Music. To add one, open a saved ride's details and tap <b className="font-medium text-ice">Publish as curated ride</b>.</p>
        {error && <p className="m-0 text-[14px] text-ice">{error}</p>}
        {rides === null && !error && <p className="m-0 text-[14px] text-mist">Loading…</p>}
        {rides?.length === 0 && <div className="rounded-[18px] border-2 border-dashed border-line p-6 text-center text-[14px] text-mist">Nothing here yet.</div>}
        <div className="flex flex-col gap-2">
          {rides?.map((r) => (
            <a key={r.id} href={`/admin/rides/${r.id}`} className="flex items-center gap-3 rounded-[16px] border-2 border-line bg-tile px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-[17px] font-normal text-ink">{r.title}</span>
                <span className="text-[14px] font-light text-mist">{fmtClock(r.totalSeconds)}{r.month ? ` · ${r.month}` : ""} · {3 - r.missing.length} of 3 playlists{r.missing.length ? ` (needs ${r.missing.map((m) => SERVICE_LABEL[m]).join(", ")})` : ""}</span>
              </div>
              <span className={`flex-none rounded-full px-3 py-[2px] text-[14px] font-medium ${r.status === "published" ? "bg-ice text-ground" : "border-2 border-line text-ice"}`}>{r.status === "published" ? "Live" : "Draft"}</span>
            </a>
          ))}
        </div>
      </div>
    </PhoneShell>
  );
}
