import { HandIcon } from "./Icons";

/** Screen 3 overlay: sits on top of the (dimmed) ride screen. Pulses harder the longer it is ignored. */
export default function TapBanner({ ignoredSec }: { ignoredSec: number }) {
  const insistent = ignoredSec >= 20;
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
