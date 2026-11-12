"use client";
import { useEffect } from "react";
import { authConfigured } from "@/lib/auth/config";

/**
 * If a data request comes back "sign in" (the session ended while the app was open), send the person to the sign-in page
 * and bring them back afterwards. Does nothing when accounts are off.
 */
export default function AuthGuard() {
  useEffect(() => {
    if (!authConfigured()) return;
    const original = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      if (res.status === 401) {
        try {
          const first = args[0];
          const url = typeof first === "string" ? first : first instanceof URL ? first.pathname : first.url;
          if (url.startsWith("/api/") && !url.startsWith("/api/auth/")) {
            const body = await res.clone().json().catch(() => null);
            if (body?.code === "signin") window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          }
        } catch { /* leave the response as it is */ }
      }
      return res;
    };
    return () => { window.fetch = original; };
  }, []);
  return null;
}
