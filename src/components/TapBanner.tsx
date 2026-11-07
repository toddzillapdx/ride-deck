import { HandIcon } from "./Icons";

/** Screen 3 overlay: sits on top of the (dimmed) ride screen. Pulses harder the longer it is ignored. */
export default function TapBanner({ ignoredSec, compact }: { ignoredSec: number; compact?: boolean }) {
  const insistent = ignoredSec >= 20;
  if (compact) {
    return (
      <div className="pointer-events-none fixed inset-x-0 z-30 flex justify-center" style={{ top: "max(12px, env(safe-area-inset-top))", paddingLeft: "max(14px, env(safe-area-inset-left))", paddingRight: "max(14px, env(safe-area-inset-right))" }}>
        <div className={`flex w-full flex-col items-center justify-center gap-1 rounded-[24px] bg-ice px-4 py-3 text-center text-ground ${insistent ? "tap-pulse" : ""}`}>
          <HandIcon size={28} color="#002A33" stroke={1.8} />
          <span className="font-light uppercase leading-none" style={{ fontSize: "min(9dvh, 8vw)", letterSpacing: ".02em" }}>Tap the screen</span>
          <span className="text-[14px] font-normal">Keeps your phone awake. Your ride keeps running.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className={`absolute flex flex-col items-center justify-center gap-[18px] rounded-[36px] bg-ice text-center text-ground ${insistent ? "tap-pulse" : ""}`}
        style={{ left: 56, top: 64, width: 1168, height: 300 }}
      >
        <HandIcon size={64} color="#002A33" stroke={1.6} />
        <span className="text-[80px] font-light uppercase leading-none" style={{ letterSpacing: ".02em" }}>Tap the screen</span>
        <span className="text-[20px] font-normal" style={{ letterSpacing: ".02em" }}>Keeps the tablet awake. Your ride keeps running.</span>
      </div>
    </div>
  );
}
