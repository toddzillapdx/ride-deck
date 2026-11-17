// Server-side only. The admin console's reads and actions. Always called after requireAdmin(); it uses the service key,
// because it has to see every person's account, which a signed-in client is not allowed to.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlausibleEmail, normalizeEmail } from "../auth/email";
import { countsOf, inviteMailto, inviteMessage, suggestEmail, type ConsoleData, type ConsoleInvite, type ConsoleLogEntry, type ConsoleRequest, type ConsoleRider, type RequestStatus } from "../admin/console";
import { emailConfigured, sendEmail, type SendResult } from "../email/resend";
import { isService } from "../services";
import { NotFound, RuleBroken, db, must } from "./client";

type Client = SupabaseClient;
type Row = Record<string, unknown>;

const PAGE = 1000;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

interface AuthUser { id: string; email?: string | null; created_at?: string | null; last_sign_in_at?: string | null; banned_until?: string | null }

async function allUsers(c: Client): Promise<{ users: AuthUser[]; truncated: boolean }> {
  const { data, error } = await c.auth.admin.listUsers({ page: 1, perPage: PAGE });
  if (error) throw new Error(`Database: ${error.message}`);
  const users = (data?.users ?? []) as AuthUser[];
  return { users, truncated: users.length >= PAGE };
}

// ---- reading ------------------------------------------------------------------------------------------------------------

export async function loadConsole(me: { email: string | null; userId: string | null }, c: Client = db(), now = Date.now()): Promise<ConsoleData> {
  const [reqRows, invRows, adminRows, { users, truncated }, logRows, settingRows, rideRows] = await Promise.all([
    c.from("invite_requests").select("*").order("created_at", { ascending: false }).range(0, 499),
    c.from("invites").select("*").order("created_at", { ascending: false }).range(0, 999),
    c.from("admins").select("email"),
    allUsers(c),
    c.from("admin_log").select("*").order("at", { ascending: false }).range(0, 24),
    c.from("app_settings").select("user_id, value").eq("key", "main"),
    c.from("ride_logs").select("user_id, started_at").range(0, 9999),
  ]);
  const requests: ConsoleRequest[] = ((must(reqRows) ?? []) as Row[]).map((r) => ({
    email: String(r.email), note: str(r.note), status: (str(r.status) ?? "new") as RequestStatus, createdAt: str(r.created_at) ?? "", suggestion: suggestEmail(String(r.email)),
  }));
  const inviteList = (must(invRows) ?? []) as Row[];
  const adminEmails = new Set(((must(adminRows) ?? []) as Row[]).map((r) => String(r.email).toLowerCase()));
  const accountEmails = new Set(users.map((u) => (u.email ?? "").toLowerCase()));

  // invited, but no account yet: they have not signed in
  const invites: ConsoleInvite[] = inviteList.filter((r) => !accountEmails.has(String(r.email).toLowerCase())).map((r) => ({
    email: String(r.email), note: str(r.note), createdAt: str(r.created_at) ?? "", suggestion: suggestEmail(String(r.email)),
  }));

  const rides = new Map<string, { n: number; last: string | null }>();
  for (const r of (must(rideRows) ?? []) as Row[]) {
    const id = str(r.user_id); if (!id) continue;
    const cur = rides.get(id) ?? { n: 0, last: null };
    cur.n++; const t = str(r.started_at); if (t && (!cur.last || t > cur.last)) cur.last = t;
    rides.set(id, cur);
  }
  const serviceOf = new Map<string, string>();
  for (const r of (must(settingRows) ?? []) as Row[]) {
    const id = str(r.user_id); const v = (typeof r.value === "string" ? safeJson(r.value) : r.value) as { service?: unknown } | null;
    if (id && v && isService(v.service)) serviceOf.set(id, v.service);
  }

  const riders: ConsoleRider[] = users.map((u) => {
    const email = (u.email ?? "").toLowerCase();
    const ride = rides.get(u.id);
    return {
      id: u.id, email: u.email ?? "(no email)", joinedAt: u.created_at ?? "", lastSignInAt: u.last_sign_in_at ?? null, lastRideAt: ride?.last ?? null, rideCount: ride?.n ?? 0,
      service: (serviceOf.get(u.id) as ConsoleRider["service"]) ?? null,
      disabled: !!u.banned_until && Date.parse(u.banned_until) > now, isAdmin: adminEmails.has(email), isYou: u.id === me.userId,
    };
  }).sort((a, b) => (b.lastRideAt ?? b.lastSignInAt ?? b.joinedAt).localeCompare(a.lastRideAt ?? a.lastSignInAt ?? a.joinedAt));

  const log: ConsoleLogEntry[] = ((must(logRows) ?? []) as Row[]).map((r) => ({ at: String(r.at), admin: String(r.admin_email), action: String(r.action), target: str(r.target) ?? "", detail: str(r.detail) }));
  return { requests, invites, riders, log, emailConfigured: emailConfigured(), ridersTruncated: truncated, counts: countsOf(requests, invites, riders, now) };
}

const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

// ---- actions -----------------------------------------------------------------------------------------------------------

export type AdminAction =
  | { action: "add_invite"; email: string; note?: string; notify?: boolean }
  | { action: "approve_request"; email: string; notify?: boolean }
  | { action: "decline_request"; email: string }
  | { action: "reopen_request"; email: string }
  | { action: "remove_invite"; email: string }
  | { action: "send_invite_email"; email: string }
  | { action: "disable_rider"; userId: string }
  | { action: "enable_rider"; userId: string };

const ACTIONS = ["add_invite", "approve_request", "decline_request", "reopen_request", "remove_invite", "send_invite_email", "disable_rider", "enable_rider"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turns what the browser sent into a checked action, or says plainly what is wrong with it. */
export function parseAction(body: unknown): AdminAction {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = typeof b.action === "string" ? b.action : "";
  if (!ACTIONS.includes(action)) throw new RuleBroken("Unknown action.");
  if (action === "disable_rider" || action === "enable_rider") {
    if (typeof b.userId !== "string" || !UUID.test(b.userId)) throw new RuleBroken("That is not a valid rider id.");
    return { action, userId: b.userId } as AdminAction;
  }
  const email = normalizeEmail(b.email);
  if (!isPlausibleEmail(email)) throw new RuleBroken("That does not look like an email address.");
  const bool = (v: unknown) => v === true;
  switch (action) {
    case "add_invite": return { action, email, note: typeof b.note === "string" ? b.note.replace(/\s+/g, " ").trim().slice(0, 300) : undefined, notify: bool(b.notify) };
    case "approve_request": return { action, email, notify: bool(b.notify) };
    default: return { action, email } as AdminAction;
  }
}

export interface ActionResult {
  message: string;
  /** Set when an invitation email was involved. If it was not sent automatically, `mailto` opens it in the admin's own mail app. */
  email?: { to: string; sent: boolean; reason?: string; detail?: string; mailto?: string };
}
export interface Actor { email: string; userId: string | null }
type Sender = (m: { to: string; subject: string; text: string; html: string }) => Promise<SendResult>;

async function invitation(to: string, send: Sender): Promise<NonNullable<ActionResult["email"]>> {
  const m = inviteMessage();
  const r = await send({ to, ...m });
  return r.sent ? { to, sent: true } : { to, sent: false, reason: r.reason, detail: r.detail, mailto: inviteMailto(to) };
}

async function log(c: Client, by: Actor, action: string, target: string, detail?: string) {
  try { await c.from("admin_log").insert({ admin_email: by.email, action, target, detail: detail ?? null }); } catch { /* a log failure never blocks the action */ }
}

async function isAdminEmail(c: Client, email: string): Promise<boolean> {
  const r = must(await c.from("admins").select("email").eq("email", email).maybeSingle()) as Row | null;
  return !!r;
}

export async function performAction(a: AdminAction, by: Actor, c: Client = db(), send: Sender = sendEmail): Promise<ActionResult> {
  switch (a.action) {
    case "add_invite": {
      const have = must(await c.from("invites").select("email").eq("email", a.email).maybeSingle()) as Row | null;
      if (!have) must(await c.from("invites").insert({ email: a.email, note: a.note || "added by admin" }));
      must(await c.from("invite_requests").update({ status: "invited" }).eq("email", a.email));
      await log(c, by, have ? "invite (already invited)" : "invite", a.email);
      const email = a.notify && !have ? await invitation(a.email, send) : undefined;
      return { message: have ? `${a.email} was already on the invite list.` : `${a.email} is invited.`, email };
    }
    case "approve_request": {
      const req = must(await c.from("invite_requests").select("email").eq("email", a.email).maybeSingle()) as Row | null;
      if (!req) throw new NotFound(`There is no request from ${a.email}.`);
      const have = must(await c.from("invites").select("email").eq("email", a.email).maybeSingle()) as Row | null;
      if (!have) must(await c.from("invites").insert({ email: a.email, note: "approved" }));
      must(await c.from("invite_requests").update({ status: "invited" }).eq("email", a.email));
      await log(c, by, "approve", a.email);
      const email = a.notify ? await invitation(a.email, send) : undefined;
      return { message: `${a.email} is approved.`, email };
    }
    case "decline_request":
    case "reopen_request": {
      const status = a.action === "decline_request" ? "declined" : "new";
      const rows = (must(await c.from("invite_requests").update({ status }).eq("email", a.email).select("email")) ?? []) as Row[];
      if (!rows.length) throw new NotFound(`There is no request from ${a.email}.`);
      await log(c, by, a.action === "decline_request" ? "decline" : "reopen", a.email);
      return { message: a.action === "decline_request" ? `${a.email} was declined.` : `${a.email} is back in the new requests.` };
    }
    case "remove_invite": {
      if (await isAdminEmail(c, a.email)) throw new RuleBroken("That is an admin account. It cannot be removed here.");
      const { users } = await allUsers(c);
      if (users.some((u) => (u.email ?? "").toLowerCase() === a.email)) throw new RuleBroken(`${a.email} already has an account. Disable the rider instead.`);
      const rows = (must(await c.from("invites").delete().eq("email", a.email).select("email")) ?? []) as Row[];
      if (!rows.length) throw new NotFound(`${a.email} is not on the invite list.`);
      must(await c.from("invite_requests").update({ status: "declined" }).eq("email", a.email));
      await log(c, by, "remove invite", a.email);
      return { message: `${a.email} was removed from the invite list.` };
    }
    case "send_invite_email": {
      const have = must(await c.from("invites").select("email").eq("email", a.email).maybeSingle()) as Row | null;
      if (!have) throw new NotFound(`${a.email} is not on the invite list.`);
      const email = await invitation(a.email, send);
      await log(c, by, email.sent ? "email sent" : "email not sent", a.email, email.detail);
      return { message: email.sent ? `Invitation email sent to ${a.email}.` : `The email could not be sent automatically.`, email };
    }
    case "disable_rider":
    case "enable_rider": {
      const { data, error } = await c.auth.admin.getUserById(a.userId);
      if (error || !data?.user) throw new NotFound("That rider does not exist.");
      const email = (data.user.email ?? "").toLowerCase();
      if (a.action === "disable_rider") {
        if (a.userId === by.userId) throw new RuleBroken("You cannot disable your own account.");
        if (await isAdminEmail(c, email)) throw new RuleBroken("That is an admin account. It cannot be disabled here.");
      }
      const res = await c.auth.admin.updateUserById(a.userId, { ban_duration: a.action === "disable_rider" ? "876000h" : "none" });
      if (res.error) throw new Error(`Database: ${res.error.message}`);
      await log(c, by, a.action === "disable_rider" ? "disable rider" : "enable rider", email);
      return { message: a.action === "disable_rider" ? `${email} is disabled. They can't sign in until you enable them.` : `${email} can sign in again.` };
    }
  }
}
