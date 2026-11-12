// Server-side only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { authConfigured } from "../auth/config";
import { serverAuthClient } from "../auth/server";
import { Unauthorized, db } from "./client";

export interface Requester {
  /** What this request may touch. Signed in: a client that acts as that person, so the database only shows their own rows. */
  client: SupabaseClient;
  userId: string | null;
  email: string | null;
  /** True when accounts are on (a person is signed in). False while accounts are off: the app behaves as it always has. */
  accounts: boolean;
}

/**
 * The database client for this request.
 * - Accounts off (no sign-in settings): the shared server client, exactly as before.
 * - Accounts on: the signed-in person's client, or Unauthorized if there is nobody (a 401 for the browser).
 */
export async function requester(): Promise<Requester> {
  if (!authConfigured()) return { client: db(), userId: null, email: null, accounts: false };
  const c = serverAuthClient();
  if (!c) throw new Unauthorized("Sign in to continue.");
  const { data, error } = await c.auth.getUser();
  if (error || !data.user) throw new Unauthorized("Sign in to continue.");
  return { client: c, userId: data.user.id, email: data.user.email ?? null, accounts: true };
}
