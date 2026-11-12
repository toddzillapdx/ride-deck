"use client";
import { useEffect, useState } from "react";
import { authConfigured } from "@/lib/auth/config";
import { browserClient } from "@/lib/auth/browser";

/** A small account button for the library header: "Sign in" when signed out, the email and "Sign out" when signed in. Invisible when accounts are off. */
export default function AccountMenu({ className = "" }: { className?: string }) {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const c = browserClient();
    if (!c) return;
    c.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)).catch(() => setEmail(null));
  }, []);
  if (!authConfigured() || email === undefined) return null;
  if (!email) return <a href="/login" className={`flex items-center rounded-full border-2 border-line px-5 text-[14px] text-ink ${className}`}>Sign in</a>;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account" className={`flex items-center rounded-full border-2 border-line px-5 text-[14px] text-ink ${className}`}>Account</button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 flex w-[260px] flex-col gap-3 rounded-[16px] border-2 border-line bg-ground p-4 shadow-lg">
          <span className="truncate text-[14px] text-mist">{email}</span>
          <button onClick={async () => { await browserClient()?.auth.signOut(); window.location.href = "/login"; }}
            className="h-11 rounded-full border-2 border-line text-[14px] text-ink">Sign out</button>
        </div>
      )}
    </div>
  );
}
