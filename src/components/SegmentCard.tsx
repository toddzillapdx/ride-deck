"use client";
import { fmtClock } from "@/lib/format";
import { RATIO_SECONDS, intervalDefaults, newSeg, type SegDraft, type SegType, type SongDraft } from "@/lib/builderV2";
import { COOLDOWN_SEC } from "@/lib/songFlow";
import type { FlatRole, IntervalKind, IntervalRatio } from "@/lib/engine";
import { Choice, Num, Pair, field } from "./builderUi";

/** One song and the segment it drives. The length is read-only: the song decides it. */
export default function SegmentCard({ s, i, song, startSec, lenSec, end, on, repeat }: {
  s: SegDraft; i: number; song: SongDraft; startSec?: number; lenSec?: number;
  /** "first" is locked as the warm-up, "last" as the cool-down. */
  end?: "first" | "last"; on: (p: Partial<SegDraft>) => void; repeat?: () => void;
}) {
  const changeType = (t: SegType) => on({ ...newSeg(t), key: s.key, songCount: "1" });
  const hillSteps = s.type === "hill" ? Math.abs(Number(s.effTo) - Number(s.effFrom)) + 1 : 0;
  const finalRest = (Number(s.restSec) || 0) + (Number(s.adjust) || 0);
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border-2 border-line bg-tile p-4">
      <div className="flex items-center gap-3">
        <span className="w-6 text-center text-[15px] font-medium text-mist">{i + 1}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="truncate text-[16px] font-normal">{song.title}</span>
          <span className="truncate text-[14px] font-light text-mist">{song.artist}{song.durationSec ? ` · ${fmtClock(song.durationSec)}` : ""}{song.intensity ? ` · feels ${song.intensity}/10` : ""}</span>
        </div>
        {end ? (
          <span className="rounded-full border-2 border-ice px-4 py-[6px] text-[14px] font-medium uppercase tracking-[.12em] text-ice">{end === "first" ? "Warm-up" : "Cool-down"}</span>
        ) : (
          <Choice aria="Segment type" value={s.type} on={changeType} options={[{ v: "flat", text: "Flat" }, { v: "hill", text: "Hill" }, { v: "interval", text: "Interval" }]} />
        )}
        <div className="flex w-[110px] flex-col items-end">
          <span className="text-[22px] font-light leading-none">{lenSec !== undefined ? fmtClock(lenSec) : "—"}</span>
          {startSec !== undefined && <span className="text-[14px] font-light text-mist">starts {fmtClock(startSec)}</span>}
        </div>
        {!end && repeat && <button onClick={repeat} className="h-11 rounded-full border-2 border-line px-4 text-[14px] text-ink" aria-label="Same as the segment above">Same as above</button>}
      </div>

      {end === "last" && <p className="m-0 pl-9 text-[14px] font-light text-mist">Starts when this song starts and runs {fmtClock(COOLDOWN_SEC)}. Then stretching, while the song plays out.</p>}

      {s.type === "flat" && (
        <div className="flex flex-wrap items-center gap-3 pl-9">
          {!end && <Choice<FlatRole> aria="Role" value={s.role === "warmup" || s.role === "cooldown" ? "steady" : s.role} on={(role) => on({ role })} options={[{ v: "steady", text: "Steady" }, { v: "recover", text: "Recover" }]} />}
          <Pair text="Cadence" a={s.cadMin} b={s.cadMax} on={(a, b) => on({ cadMin: a, cadMax: b })} />
          <Pair text="Effort" a={s.effMin} b={s.effMax} on={(a, b) => on({ effMin: a, effMax: b })} />
        </div>
      )}
      {s.type === "hill" && (
        <div className="flex flex-wrap items-center gap-3 pl-9">
          <Pair text="Cadence" a={s.cadMin} b={s.cadMax} on={(a, b) => on({ cadMin: a, cadMax: b })} />
          <Pair text="Effort" a={s.effFrom} b={s.effTo} on={(a, b) => on({ effFrom: a, effTo: b })} ph={["from", "to"]} />
          <span className="text-[14px] font-light text-mist">{hillSteps > 1 && lenSec ? `${hillSteps} steps of ${fmtClock(Math.round(lenSec / hillSteps))}, the whole song` : hillSteps === 1 ? "one level: rides as flat" : ""}</span>
        </div>
      )}
      {s.type === "interval" && (
        <div className="flex flex-col gap-3 pl-9">
          <div className="flex flex-wrap items-center gap-3">
            <Choice<IntervalKind> aria="Interval kind" value={s.workKind} on={(k) => on(intervalDefaults(k))} options={[{ v: "sprint", text: "Sprint", sub: "fast, light" }, { v: "resistance", text: "Resistance", sub: "heavy, slow" }]} />
            <Choice<IntervalRatio> aria="Ratio" value={s.ratio} on={(r) => on({ ratio: r, workSec: String(RATIO_SECONDS[r][0]), restSec: String(RATIO_SECONDS[r][1]) })} options={[{ v: "1:1", text: "1:1 · 30/30" }, { v: "2:1", text: "2:1 · 40/20" }]} />
            <span className="text-[14px] font-light text-mist">{s.rounds} rounds{finalRest !== Number(s.restSec) ? `, last rest ${finalRest}s` : ""}, fitted to the song</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="w-[52px] text-[14px] font-medium uppercase tracking-[.1em] text-ice">Work</span>
            <Pair text="Cadence" a={s.wCadMin} b={s.wCadMax} on={(a, b) => on({ wCadMin: a, wCadMax: b })} />
            <Pair text="Effort" a={s.wEffMin} b={s.wEffMax} on={(a, b) => on({ wEffMin: a, wEffMax: b })} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="w-[52px] text-[14px] font-medium uppercase tracking-[.1em] text-mist">Rest</span>
            <Pair text="Cadence" a={s.rCadMin} b={s.rCadMax} on={(a, b) => on({ rCadMin: a, rCadMax: b })} />
            <Pair text="Effort" a={s.rEffMin} b={s.rEffMax} on={(a, b) => on({ rEffMin: a, rEffMax: b })} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 pl-9">
        <input className={`${field} w-[220px] flex-none`} value={s.name} onChange={(e) => on({ name: e.target.value })} aria-label="Segment name" />
        <input className={`${field} min-w-0 flex-1`} value={s.cue} onChange={(e) => on({ cue: e.target.value })} placeholder="Cue shown during the segment" aria-label="Cue" />
      </div>
    </div>
  );
}
