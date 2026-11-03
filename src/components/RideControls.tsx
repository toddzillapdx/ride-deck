"use client";
import { useRef, useState } from "react";

export function BigButton({ onClick, children, small }: { onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button onClick={onClick} className={`${small ? "h-[64px] px-12 text-[18px]" : "h-[84px] px-16 text-[22px]"} rounded-full bg-ice font-medium uppercase tracking-[.1em] text-ground`}>
      {children}
    </button>
  );
}

export function CtlButton({ onClick, children, primary }: { onClick: () => void; children: React.ReactNode; primary?: boolean }) {
  return (
    <button onClick={onClick} className={`h-[60px] rounded-full px-8 text-[16px] font-medium ${primary ? "bg-ice text-ground" : "border-2 border-line text-ink"}`}>
      {children}
    </button>
  );
}

/** Press and hold 1.5s to confirm, so it can't be hit by accident. */
export function HoldButton({ onHold, children, className = "" }: { onHold: () => void; children: React.ReactNode; className?: string }) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const stop = () => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
    setHolding(false);
  };
  return (
    <button
      onPointerDown={() => {
        setHolding(true);
        t.current = setTimeout(() => { stop(); onHold(); }, 1500);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`h-[60px] rounded-full border-2 px-8 text-[16px] font-medium select-none ${holding ? "border-ice bg-ice text-ground" : "border-line text-ink"} ${className}`}
    >
      {holding ? "Keep holding…" : children}
    </button>
  );
}

export function PauseIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <rect x="5" y="4" width="5" height="16" rx="1.5" />
      <rect x="14" y="4" width="5" height="16" rx="1.5" />
    </svg>
  );
}

export function PlayIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}
