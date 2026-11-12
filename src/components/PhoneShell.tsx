"use client";
import type { ReactNode } from "react";

/** Scrolling full-screen page for the phone layouts, padded for notches and the home indicator. */
export default function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 overflow-y-auto overflow-x-hidden bg-ground text-ink"
      style={{
        paddingTop: "max(14px, env(safe-area-inset-top))",
        paddingRight: "max(16px, env(safe-area-inset-right))",
        paddingBottom: "max(18px, env(safe-area-inset-bottom))",
        paddingLeft: "max(16px, env(safe-area-inset-left))",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {children}
    </div>
  );
}
