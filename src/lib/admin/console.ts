/** Pure logic for the admin console: who is in which state, typo help for email addresses, and the invitation email. No network here. */
import type { Service } from "../services";

// ---- what the console shows -----------------------------------------------------------------------------------------

export type RequestStatus = "new" | "invited" | "declined";
export interface ConsoleRequest { email: string; note: string | null; status: RequestStatus; createdAt: string; suggestion: string | null }
/** On the invite list but no account yet (they have not signed in). */
export interface ConsoleInvite { email: string; note: string | null; exempt: boolean; createdAt: string; suggestion: string | null }
export interface ConsoleRider {
  id: string; email: string; joinedAt: string; lastSignInAt: string | null; lastRideAt: string | null; rideCount: number;
  service: Service | null; exempt: boolean; disabled: boolean; isAdmin: boolean; isYou: boolean;
}
export interface ConsoleLogEntry { at: string; admin: string; action: string; target: string; detail: string | null }
export interface ConsoleData {
  requests: ConsoleRequest[]; invites: ConsoleInvite[]; riders: ConsoleRider[]; log: ConsoleLogEntry[];
  emailConfigured: boolean; ridersTruncated: boolean;
  counts: { newRequests: number; waiting: number; active: number; disabled: number };
}

/** Active = rode or signed in during the last 7 days. */
export const ACTIVE_DAYS = 7;
export function isActiveRider(r: Pick<ConsoleRider, "lastSignInAt" | "lastRideAt" | "disabled">, now = Date.now()): boolean {
  if (r.disabled) return false;
  const cutoff = now - ACTIVE_DAYS * 86400_000;
  return [r.lastRideAt, r.lastSignInAt].some((t) => !!t && Date.parse(t) >= cutoff);
}

export function countsOf(requests: ConsoleRequest[], invites: ConsoleInvite[], riders: ConsoleRider[], now = Date.now()) {
  return {
    newRequests: requests.filter((r) => r.status === "new").length,
    waiting: invites.length,
    active: riders.filter((r) => isActiveRider(r, now)).length,
    disabled: riders.filter((r) => r.disabled).length,
  };
}

// ---- typo help --------------------------------------------------------------------------------------------------------

const COMMON = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com", "comcast.net"];

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * "Did you mean gmail.com?": when the part after @ is one or two typos away from a well-known mail provider, say which. Returns the whole
 * corrected address, or null when it looks fine (or is a domain we know nothing about, such as a company address).
 */
export function suggestEmail(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^([^\s@]+)@([^\s@]+)$/);
  if (!m) return null;
  const [, local, domain] = m;
  if (COMMON.includes(domain)) return null;
  let best: { d: string; score: number } | null = null;
  for (const c of COMMON) { // listed most common first, so a tie goes to the more common provider
    const dist = distance(domain, c);
    // short names need to be close (one slip), longer ones can be two slips off ("ail.com" is gmail.com with "gm" lost)
    const limit = c.length <= 8 ? 1 : 2;
    if (dist < 1 || dist > limit) continue;
    // letters lost from the start or the end of a provider name are the commonest slip, so they rank a little better
    const score = dist - (c.endsWith(domain) || c.startsWith(domain) ? 1 : 0);
    if (!best || score < best.score) best = { d: c, score };
  }
  return best ? `${local}@${best.d}` : null;
}

// ---- the invitation email -----------------------------------------------------------------------------------------------

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://ridedeck.app").replace(/\/+$/, "");

export interface InviteMessage { subject: string; text: string; html: string }

/** What a new tester receives. Short, plain, says exactly what to do next. */
export function inviteMessage(site = siteUrl()): InviteMessage {
  const subject = "You're in: welcome to the RideDeck beta";
  const text = [
    "You're in. Thanks for helping test RideDeck.",
    "",
    "RideDeck is a ride coach for your indoor bike. You pick a ride, press play on its playlist in your own music app, and the app tells you what to do and when.",
    "",
    "To start:",
    `1. Open ${site} on your phone.`,
    "2. Tap Sign in and enter this email address. We email you an 8-digit code (no password).",
    "3. Choose your music service, pick a ride and tap Start.",
    "",
    "Tip: in Safari tap Share, then Add to Home Screen, so it opens full screen.",
    "",
    "This is a small beta, so I'd love to hear what works and what doesn't. Just reply to this email.",
    "",
    "Thanks,",
    "RideDeck",
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#10222a;max-width:520px">`
    + `<p><b>You're in.</b> Thanks for helping test RideDeck.</p>`
    + `<p>RideDeck is a ride coach for your indoor bike. You pick a ride, press play on its playlist in your own music app, and the app tells you what to do and when.</p>`
    + `<p>To start:</p><ol><li>Open <a href="${esc(site)}">${esc(site)}</a> on your phone.</li><li>Tap <b>Sign in</b> and enter this email address. We email you an 8-digit code (no password).</li><li>Choose your music service, pick a ride and tap <b>Start</b>.</li></ol>`
    + `<p style="color:#4b6670">Tip: in Safari tap Share, then Add to Home Screen, so it opens full screen.</p>`
    + `<p>This is a small beta, so I'd love to hear what works and what doesn't. Just reply to this email.</p><p>Thanks,<br>RideDeck</p></div>`;
  return { subject, text, html };
}

/** A mail link that opens the person's own mail app with the invitation filled in: the fallback when automatic email is not set up. */
export const inviteMailto = (to: string, site = siteUrl()) => {
  const m = inviteMessage(site);
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}`;
};
