"use client";
import { useEffect, useState } from "react";

export interface LayoutInfo {
  /** Phone-sized screen (short side under 600 CSS px). The tablet and desktop keep the 1280x800 canvas. */
  phone: boolean;
  landscape: boolean;
}

/** null until mounted, so the server and first client render agree. */
export function useLayout(): LayoutInfo | null {
  const [info, setInfo] = useState<LayoutInfo | null>(null);
  useEffect(() => {
    const read = () => {
      const w = window.innerWidth, h = window.innerHeight;
      setInfo((prev) => {
        const next = { phone: Math.min(w, h) < 600, landscape: w > h };
        return prev && prev.phone === next.phone && prev.landscape === next.landscape ? prev : next;
      });
    };
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => { window.removeEventListener("resize", read); window.removeEventListener("orientationchange", read); };
  }, []);
  return info;
}
