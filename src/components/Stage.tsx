"use client";
import { useEffect, useState } from "react";

const W = 1280;
const H = 800;

/** Lays out children on a fixed 1280x800 canvas and scales it to fit the viewport. */
export default function Stage({ bg, children }: { bg: string; children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const fit = () => {
      setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
      setPortrait(window.innerWidth < 800 && window.innerHeight > window.innerWidth);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ background: bg }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, flex: "none", position: "relative" }}>{children}</div>
      {portrait && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 px-6 text-center text-[14px] font-normal text-mist">
          RideDeck is built for a landscape tablet. Turn your phone sideways for a larger view.
        </div>
      )}
    </div>
  );
}
