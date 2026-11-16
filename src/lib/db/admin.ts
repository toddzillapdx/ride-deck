// Server-side only.
import { Forbidden } from "./client";
import { requester, type Requester } from "./request";

/**
 * Is this person the admin (the curator)? The database answers (is_admin() reads the admins list for the signed-in email),
 * so the browser can never claim it. Accounts off (no sign-in settings): the app is a single-person tool, so yes.
 * A database error is an error, not "no": a failed check never lets anyone through.
 */
export async function isAdmin(me: Requester): Promise<boolean> {
  if (!me.accounts) return true;
  const { data, error } = await me.client.rpc("is_admin");
  if (error) throw new Error(`Database: ${error.message}`);
  return data === true;
}

/** Like requester(), but only for the admin: Unauthorized (401) when nobody is signed in, Forbidden (403) for everyone else. */
export async function requireAdmin(): Promise<Requester> {
  const me = await requester();
  if (!(await isAdmin(me))) throw new Forbidden("This is for the RideDeck admin.");
  return me;
}
