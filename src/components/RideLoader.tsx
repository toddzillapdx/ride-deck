"use client";
import { useEffect, useState } from "react";
import { loadRide } from "@/lib/client";
import type { Ride } from "@/lib/engine";
import RidePlayer from "./RidePlayer";

export default function RideLoader({ id }: { id: string }) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadRide(id).then(setRide).catch((e: Error) => setError(e.message));
  }, [id]);

  if (ride) return <RidePlayer ride={ride} />;
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-ground p-6 text-center">
      <span className="text-[24px] font-light text-ink">{error ?? "Loading ride…"}</span>
      {error && <a href="/" className="rounded-full bg-ice px-10 py-4 text-[18px] font-medium text-ground">Back to library</a>}
    </div>
  );
}
