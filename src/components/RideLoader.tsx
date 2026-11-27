"use client";
import { useEffect, useState } from "react";
import { loadRide } from "@/lib/client";
import { trackEvent } from "@/lib/events";
import type { Ride } from "@/lib/engine";
import RidePlayer from "./RidePlayer";
import { isCuratedId } from "@/lib/curatedIds";

export default function RideLoader({ id }: { id: string }) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      // A published ride opened from an invitation link, by someone who has not chosen a music service yet: choose it first (the
      // library asks, then brings them back here), so the ride opens with its playlist button.
      if (isCuratedId(id)) {
        try {
          const res = await fetch("/api/curated", { cache: "no-store" });
          const b = await res.json().catch(() => null);
          if (res.ok && b && !b.service) { window.location.replace(`/?ride=${encodeURIComponent(id)}`); return; }
        } catch { /* if this check fails, just open the ride */ }
      }
      return loadRide(id).then((r) => { setRide(r); trackEvent(id, "opened"); }).catch((e: Error) => setError(e.message));
    })();
  }, [id]);

  if (ride) return <RidePlayer ride={ride} />;
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-ground p-6 text-center">
      <span className="text-[24px] font-light text-ink">{error ?? "Loading ride…"}</span>
      {error && <a href="/" className="rounded-full bg-ice px-10 py-4 text-[18px] font-medium text-ground">Back to library</a>}
    </div>
  );
}
