import type { LogPatch, RideLog } from "./history";

export class HistoryOff extends Error {}

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<RideLog> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (res.status === 503) throw new HistoryOff("History isn't connected to Airtable");
  if (!res.ok) throw new Error(out.error ?? `Couldn't save (${res.status})`);
  return out as RideLog;
}

export const postLog = (payload: unknown) => send("/api/history", "POST", payload);
export const patchLog = (id: string, patch: LogPatch) => send(`/api/history/${encodeURIComponent(id)}`, "PATCH", patch);
