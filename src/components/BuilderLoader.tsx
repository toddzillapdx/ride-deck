"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Builder, { type Tab } from "./Builder";
import RideDetails from "./RideDetails";
import Stage from "./Stage";
import { emptyDraft, fromRide, type RideDraft } from "@/lib/builderV2";
import { loadRideEx } from "@/lib/client";

/**
 * /builder/new: a new ride. /builder/new?from=<id>: a duplicate to edit. /builder/<id>: the ride, read-only.
 * `?tab=music` opens the PLAN MUSIC tab.
 */
export default function BuilderLoader({ id }: { id: string }) {
  const params = useSearchParams();
  const from = params.get("from");
  const tab: Tab = params.get("tab") === "music" ? "music" : "build";
  const [state, setState] = useState<{ draft: RideDraft; heard: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id !== "new") return;
    let alive = true;
    (async () => {
      try {
        // Songs already in your other rides, so the planner picks different ones.
        const heard = await fetch("/api/rides", { cache: "no-store" }).then((r) => r.json())
          .then((b) => [...new Set(((b.rides ?? []) as { id: string; tracklist?: { title: string }[] }[]).filter((w) => w.id !== from).flatMap((w) => (w.tracklist ?? []).map((t) => t.title)))].slice(0, 120))
          .catch(() => [] as string[]);
        let draft = emptyDraft();
        if (from) {
          const { ride } = await loadRideEx(from);
          draft = fromRide(ride);
          draft.name = `${draft.name} (copy)`;
          draft.sourceId = undefined; // a duplicate is its own ride: it does not replace the original
        }
        if (alive) setState({ draft, heard });
      } catch (e) { if (alive) setError((e as Error).message); }
    })();
    return () => { alive = false; };
  }, [id, from]);

  if (id !== "new") return <RideDetails id={id} />;
  if (state) return <Builder initial={state.draft} tab={tab} heard={state.heard} />;
  return (
    <Stage bg="#002A33">
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
        <span className="text-[28px] font-light">{error ?? "Loading…"}</span>
        {error && <a href="/" className="rounded-full bg-ice px-10 py-4 text-[18px] font-medium text-ground">Back to library</a>}
      </div>
    </Stage>
  );
}
