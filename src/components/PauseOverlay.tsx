import { fmtClock } from "@/lib/format";
import { BigButton, HoldButton, PlayIcon } from "./RideControls";

/** Shown whenever the ride is paused. The clock is stopped; music in the other app is unaffected. */
export default function PauseOverlay({ elapsed, remaining, onResume, onEnd, fixed }: {
  elapsed: number; remaining: number; onResume: () => void; onEnd: () => void; fixed?: boolean;
}) {
  return (
    <div
      className={`${fixed ? "fixed" : "absolute"} inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-ground text-center text-ink`}
      style={fixed ? { paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
      role="dialog" aria-label="Ride paused"
    >
      <span className="rounded-full bg-ice px-6 py-2 text-[14px] font-medium uppercase tracking-[.24em] text-ground">Paused</span>
      <div className="flex items-end gap-8">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[.18em] text-mist">Elapsed</span>
          <span className="num font-light" style={{ fontSize: "clamp(36px, 12dvh, 64px)" }}>{fmtClock(elapsed)}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[.18em] text-mist">Left</span>
          <span className="num font-light" style={{ fontSize: "clamp(36px, 12dvh, 64px)" }}>{fmtClock(Math.ceil(remaining))}</span>
        </div>
      </div>
      <BigButton onClick={onResume} small>
        <span className="flex items-center gap-3"><PlayIcon size={22} />Resume</span>
      </BigButton>
      <HoldButton onHold={onEnd} className="!h-[48px] !px-6 !text-[14px]">Hold to end ride</HoldButton>
    </div>
  );
}
