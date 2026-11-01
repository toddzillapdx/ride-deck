"use client";
import { useEffect, useState } from "react";

const W = 1280;
const H = 800;

/** Lays out children on a fixed 1280x800 canvas and scales it to fit the viewport. */
export default function Stage({ bg, children }: { bg: string; children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ background: bg }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, flex: "none", position: "relative" }}>{children}</div>
    </div>
  );
}
