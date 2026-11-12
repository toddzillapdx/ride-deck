import type { SupabaseClient } from "@supabase/supabase-js";
import { db, must } from "./client";

export interface AppSettings {
  /** Built-in starter rides the user has removed. They stay resolvable by id, so old history still works. */
  hiddenPresets: string[];
}

const KEY = "main";
type Client = SupabaseClient;

export function parseSettings(v: unknown): AppSettings {
  const o = (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : v) as { hiddenPresets?: unknown } | null;
  return { hiddenPresets: Array.isArray(o?.hiddenPresets) ? o!.hiddenPresets.filter((x: unknown): x is string => typeof x === "string") : [] };
}

export async function getSettings(c: Client = db()): Promise<AppSettings> {
  const row = must(await c.from("app_settings").select("value").eq("key", KEY).maybeSingle()) as { value: unknown } | null;
  return parseSettings(row?.value);
}

/**
 * With accounts on, settings are one row per person (the person is filled in by the database), so the row is found by
 * (user_id, key). That needs migration 0003. With accounts off it is the single shared row, found by key.
 */
export async function putSettings(s: AppSettings, c: Client = db(), perUser = false): Promise<AppSettings> {
  must(await c.from("app_settings").upsert({ key: KEY, value: s, updated_at: new Date().toISOString() }, { onConflict: perUser ? "user_id,key" : "key" }));
  return s;
}
