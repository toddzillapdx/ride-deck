"use client";
import { useCallback, useEffect, useState } from "react";

const KEY = "ridedeck-hidden-presets";
const read = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
const write = (v: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } };

/**
 * Which built-in starter rides the user has removed. Saved in the database when it is connected, so the choice follows
 * you between phone and computer; always mirrored in localStorage so the page doesn't flash the removed rides.
 */
export function useHiddenPresets() {
  const [hidden, setHidden] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [shared, setShared] = useState(false); // true when the database holds the setting

  useEffect(() => {
    setHidden(read());
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => { if (b.configured && Array.isArray(b.hiddenPresets)) { setShared(true); setHidden(b.hiddenPresets); write(b.hiddenPresets); } })
      .catch(() => { /* keep the local copy */ })
      .finally(() => setReady(true));
  }, []);

  const save = useCallback(async (next: string[]) => {
    setHidden(next);
    write(next);
    if (!shared) return;
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hiddenPresets: next }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Couldn't save (${res.status})`);
    } catch (e) {
      throw e instanceof Error ? e : new Error("Couldn't save");
    }
  }, [shared]);

  const hide = useCallback((id: string) => save([...new Set([...hidden, id])]), [hidden, save]);
  const restoreAll = useCallback(() => save([]), [save]);
  return { hidden, ready, hide, restoreAll };
}
