"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Builder, { type BuilderMode } from "./Builder";
import Stage from "./Stage";
import { emptyDraft, fromWorkout, type WorkoutDraft } from "@/lib/builder";
import { loadWorkout } from "@/lib/client";
import { isPresetId } from "@/lib/presets";

/** /builder/new, /builder/new?from=<id> (copy), /builder/<id> (edit). Presets always open as a copy. */
export default function BuilderLoader({ id }: { id: string }) {
  const from = useSearchParams().get("from");
  const [state, setState] = useState<{ draft: WorkoutDraft; mode: BuilderMode } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sourceId = id === "new" ? from : id;
    if (!sourceId) return setState({ draft: emptyDraft(), mode: { kind: "new" } });
    loadWorkout(sourceId)
      .then((w) => {
        const asCopy = id === "new" || isPresetId(id);
        const draft = fromWorkout(w);
        if (asCopy) draft.name = `${draft.name} (copy)`;
        setState({ draft, mode: asCopy ? { kind: "new" } : { kind: "edit", id } });
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
