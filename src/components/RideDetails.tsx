"use client";
import { useEffect, useState } from "react";
import Stage from "./Stage";
import { fmtClock, fmtTarget } from "@/lib/format";
import { loadRideEx } from "@/lib/client";
import { isPresetId } from "@/lib/presets";
import { rideDuration, segmentDuration, validateRide, type Ride, type RideSegment } from "@/lib/engine";

const ROLE = { warmup: "Warm-up", steady: "Steady", recover: "Recover", cooldown: "Cool-down" } as const;

function summary(s: RideSegment): string {
  if (s.type === "flat") return `${ROLE[s.role]} · cadence ${fmtTarget(s.cadence)} · effort ${fmtTarget(s.effort)}`;
  if (s.type === "hill") return `Hill · cadence ${fmtTarget(s.cadence)} · effort ${s.effortFrom} to ${s.effortTo}`;
  return `${s.workKind === "sprint" ? "Sprint" : "Resistance"} intervals · ${s.ratio} · ${s.workSec}s on / ${s.restSec}s off x ${s.rounds} · work cadence ${fmtTarget(s.work.cadence)} effort ${fmtTarget(s.work.effort)}`;
}

/** An existing ride, read-only. To change it, DUPLICATE TO EDIT opens a copy in the builder. */
export default function RideDetails({ id }: { id: string }) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    loadRideEx(id).then((r) => { setRide(r.ride); setLegacy(r.legacy); }).catch((e: Error) => setError(e.message));
  }, [id]);

  async function remove() {
    if (!ride || !window.confirm(`Delete "${ride.name}"? This can't be undone.`)) return;
    const res = await fetch(`/api/rides/${id}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/";
    else setMsg((await res.json().catch(() => ({}))).error ?? "Delete failed");
  }

  if (!ride) {
    return (
      <Stage bg="#002A33">
        <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
          <span className="text-[28px] font-light">{error ?? "Loading…"}</span>
          {error && <a href="/" className="rounded-full bg-ice px-10 py-4 text-[18px] font-medium text-ground">Back to library</a>}
        </div>
      </Stage>
    );
  }
  const songsOf = (i: number) => (ride.tracklist ?? []).filter((t) => t.segmentIndex === i);
  const warnings = validateRide(ride).filter((w) => w.code !== "song-duration-missing");
  const builtIn = isPresetId(id);
  return (
    <Stage bg="#002A33">
      <div className="flex h-full flex-col gap-4 bg-ground text-ink" style={{ padding: "28px 56px" }}>
        <div className="flex flex-none items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <a href="/" className="text-[14px] font-medium uppercase tracking-[.2em] text-mist">← Library</a>
            <span className="truncate text-[32px] font-light leading-tight">{ride.name}</span>
            <span className="text-[14px] font-light text-mist">{fmtClock(rideDuration(ride))} · {ride.segments.length} segments{ride.genre ? ` · ${ride.genre}` : ""}{ride.vibe ? ` · ${ride.vibe}` : ""}{builtIn ? " · starter ride" : legacy ? " · original ride" : ""}</span>
          </div>
          <div className="flex flex-none items-center gap-3">
            <a href={`/ride/${id}`} className="flex h-[52px] items-center rounded-full border-2 border-ice px-7 text-[15px] font-medium uppercase tracking-[.08em] text-ice">Ride</a>
            <a href={`/builder/new?from=${encodeURIComponent(id)}`} className="flex h-[52px] items-center rounded-full bg-ice px-7 text-[15px] font-medium uppercase tracking-[.08em] text-ground">Duplicate to edit</a>
          </div>
        </div>
        {warnings.map((w, i) => <p key={i} className="m-0 text-[14px] text-ice">⚠ {w.message}</p>)}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
          {ride.segments.map((s, i) => (
            <div key={i} className="flex flex-col gap-1 rounded-[16px] border-2 border-line bg-tile px-5 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[18px] font-normal"><span className="mr-3 text-mist">{i + 1}</span>{s.name}</span>
                <span className="num text-[20px] font-light">{fmtClock(segmentDuration(s))}</span>
              </div>
              <span className="text-[14px] font-light text-mist">{summary(s)}</span>
              {songsOf(i).length > 0 && <span className="text-[14px] font-light text-mist">♪ {songsOf(i).map((t) => `${t.artist} - ${t.title}`).join("  ·  ")}</span>}
            </div>
          ))}
        </div>
        <div className="flex flex-none items-center justify-between">
          <span className="text-[14px] font-light text-mist">{msg ?? "To change this ride, duplicate it: the original stays as it is."}</span>
          {!builtIn && !legacy && <button onClick={remove} className="h-11 rounded-full border-2 border-line px-6 text-[14px] text-mist">Delete ride</button>}
        </div>
      </div>
    </Stage>
  );
}
