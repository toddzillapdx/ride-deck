"use client";
import { useEffect, useState } from "react";

/**
 * Is the signed-in person the admin? null while loading (show nothing yet), then true or false.
 * Only decides what to show; the server checks every action again.
 */
export function useAdmin(): boolean | null {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((b) => { if (alive) setAdmin(b?.admin === true); }).catch(() => { if (alive) setAdmin(false); });
    return () => { alive = false; };
  }, []);
  return admin;
}
