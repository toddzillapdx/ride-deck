// Server-side only. Sends one email through Resend's HTTP API.
export interface SendResult { sent: boolean; reason?: "not-configured" | "failed"; detail?: string }

/** Whether automatic email is set up (a Resend key is present). When it is not, the console offers a copy-and-send fallback. */
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "not-configured" };
  const from = process.env.INVITE_EMAIL_FROM || "RideDeck <hello@ridedeck.app>";
  const replyTo = process.env.INVITE_REPLY_TO || undefined;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (res.ok) return { sent: true };
    const body = await res.json().catch(() => ({}));
    return { sent: false, reason: "failed", detail: String((body as { message?: unknown }).message ?? `Resend answered ${res.status}`).slice(0, 200) };
  } catch (e) {
    return { sent: false, reason: "failed", detail: (e as Error).message.slice(0, 200) };
  }
}
