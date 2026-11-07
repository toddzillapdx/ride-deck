"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Builder, { type BuilderMode } from "./Builder";
import Stage from "./Stage";
import { emptyDraft, fromRide, type RideDraft } from "@/lib/builderV2";
import { loadRideEx } from "@/lib/client";
import { isPresetId } from "@/lib/presets";

/** /builder/new, /builder/new?from=<id> (copy), /builder/<id> (edit). Presets open as a copy; a read-only legacy ride opens as an edit that saves a converted copy. */
export default function BuilderLoader({ id }: { id: string }) {
  const from = useSearchParams().get("from");
  const [state, setState] = useState<{ draft: RideDraft; mode: BuilderMode } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sourceId = id === "new" ? from : id;
    if (!sourceId) return setState({ draft: emptyDraft(), mode: { kind: "new" } });
    loadRideEx(sourceId)
      .then(({ ride, legacy }) => {
        const asCopy = id === "new" || isPresetId(id);
        const draft = fromRide(ride);
        if (asCopy) draft.name = `${draft.name} (copy)`;
        if (legacy && !asCopy) draft.sourceId = sourceId; // the saved copy replaces this original in the library
        if (asCopy) draft.sourceId = undefined;
        setState({ draft, mode: asCopy || legacy ? { kind: "new" } : { kind: "edit", id } });
      })
      .catch((e: Error) => setError(e.message));
  }, [id, from]);

  if (state) return <Builder initial={state.draft} mode={state.mode} />;
  return (
    <Stage bg="#002A33">
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
        <span className="text-[28px] font-light">{error ?? "Loading…"}</span>
        {error && <a href="/" className="rounded-full bg-ice px-10 py-4 text-[18px] font-medium text-ground">Back to library</a>}
      </div>
    </Stage>
  );
}
