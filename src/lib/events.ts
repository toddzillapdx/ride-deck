"use client";

/** What a rider did with a ride. Sent without waiting and never allowed to get in the way of a ride: a failure is ignored. */
export type RideEventKind = "opened" | "playlist_opened" | "started" | "finished";

export function trackEvent(rideId: string | undefined, kind: RideEventKind): void {
  if (!rideId) return;
  try {
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rideId, kind }), keepalive: true }).catch(() => undefined);
  } catch { /* never block a ride */ }
}
