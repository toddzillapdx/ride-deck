"use client";
import { useEffect, useState } from "react";
import { loadWorkout } from "@/lib/client";
import type { Workout } from "@/lib/types";
import Stage from "./Stage";
import RidePlayer from "./RidePlayer";

export default function RideLoader({ id }: { id: string }) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadWorkout(id).then(setWorkout).catch((e: Error) => setError(e.message));
  }, [id]);

  if (workout) return <RidePlayer workout={workout} />;
  return (
    <Stage bg="#002A33">
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
        <span className="text-[28px] font-light text-ink">{error ?? "Loading ride…"}</span>
        {error && <a href="/" className="rounded-full bg-ice px-10 py-4 text-[18px] font-medium text-ground">Back to library</a>}
      </div>
    </Stage>
  );
}
