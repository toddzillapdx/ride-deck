import { useId } from "react";
import { MARK_PROFILE, RIDE_PROFILE, barsLayout, type BarsOptions } from "@/lib/brand";

/** LED-style bars as inline SVG. A glow sits behind the peak caps when `glow` is on. */
export function LogoBars({ glow = true, className, label, ...o }: BarsOptions & { glow?: boolean; className?: string; label?: string }) {
  const id = useId().replace(/:/g, "");
  const L = barsLayout(o);
  return (
    <svg viewBox={L.viewBox} className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} xmlns="http://www.w3.org/2000/svg">
      {glow && L.caps.length > 0 && (
        <>
          <defs><filter id={`blur${id}`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9" /></filter></defs>
          <g filter={`url(#blur${id})`} opacity=".75">{L.caps.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.r} fill={r.fill} />)}</g>
        </>
      )}
      {L.rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.r} fill={r.fill} />)}
      {L.caps.map((r, i) => <rect key={`c${i}`} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.r} fill={r.fill} />)}
    </svg>
  );
}

/** The small mark: 5 bars. For headers, the sign-in page and anywhere the hero is too much. */
export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <span className={`inline-block flex-none ${className}`} style={{ width: size, height: size }}><LogoBars profile={MARK_PROFILE} W={300} H={300} rows={9} gapX={14} glow={false} className="block h-full w-full" /></span>;
}

/** The hero: 19 bars that are a ride, with a soft reflection. Scales to the width it is given. */
export function LogoHero({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-full ${className}`} aria-hidden>
      <LogoBars profile={RIDE_PROFILE} className="block w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-full" style={{ transform: "scaleY(-1)", opacity: 0.26, WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,.9), transparent 55%)", maskImage: "linear-gradient(to top, rgba(0,0,0,.9), transparent 55%)", marginTop: "-1px" }}>
        <LogoBars profile={RIDE_PROFILE} className="block w-full" glow={false} />
      </div>
    </div>
  );
}

/** "RIDEDECK" with a light Ride and a bold Deck, in Montserrat. */
export function Wordmark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`uppercase leading-none text-ice ${className}`} style={{ fontSize: size, letterSpacing: size >= 40 ? ".22em" : ".16em", whiteSpace: "nowrap" }} aria-label="RideDeck">
      <span style={{ fontWeight: 300 }}>Ride</span><span style={{ fontWeight: 600 }}>Deck</span>
    </span>
  );
}
