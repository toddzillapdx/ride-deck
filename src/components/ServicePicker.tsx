"use client";
import { useState } from "react";
import { ACTIVE_SERVICES, SERVICE_LABEL, type Service } from "@/lib/services";

/** Which music service the rider uses. Their ride playlists open in it. Saved to their account, so it is asked once. */
export default function ServicePicker({ value, onChange, intro = false, note }: { value: Service | null; onChange: (s: Service) => void; intro?: boolean; note?: string }) {
  const [busy, setBusy] = useState<Service | null>(null);
  const [error, setError] = useState("");

  async function pick(s: Service) {
    if (busy || s === value) return;
    setBusy(s); setError("");
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service: s }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Couldn't save (${res.status})`);
      onChange(s);
    } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border-2 border-line bg-tile px-4 py-4">
      <span className="text-[16px] font-normal text-ink">{intro ? "Which music service do you use?" : "Your music service"}</span>
      {note && <span className="text-[14px] leading-snug text-ice">{note}</span>}
      {intro && <span className="text-[14px] font-light leading-snug text-mist">Every ride has a playlist on both. Pick yours and its playlists open there. You can change it any time.</span>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Music service">
        {ACTIVE_SERVICES.map((s) => (
          <button key={s} role="radio" aria-checked={value === s} onClick={() => pick(s)} disabled={busy !== null}
            className={`h-[44px] rounded-full border-2 px-5 text-[14px] font-medium ${value === s ? "border-ice bg-ice text-ground" : "border-line text-ink"} ${busy === s ? "opacity-60" : ""}`}>
            {SERVICE_LABEL[s]}
          </button>
        ))}
      </div>
      {error && <span className="text-[14px] text-ice">{error}</span>}
    </div>
  );
}
