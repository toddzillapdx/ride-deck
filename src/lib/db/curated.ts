import type { SupabaseClient } from "@supabase/supabase-js";
import { readRide, rideDuration, type Ride } from "../engine";
import type { Workout } from "../types";
import { ACTIVE_SERVICES, SERVICES, SERVICE_LABEL, isHttpsUrl, missingServices, type Service } from "../services";
import { NotFound, RuleBroken, db, must } from "./client";
import { rowToRaw, rowToWorkout, type RideRow } from "./rides";

type Client = SupabaseClient;

import { curatedId, curatedUuid, isCuratedId } from "../curatedIds";
export { CURATED_PREFIX, curatedId, curatedUuid, isCuratedId } from "../curatedIds";

export type CuratedStatus = "draft" | "published";
export type Links = Partial<Record<Service, string>>;

export interface CuratedRow {
  id: string; title: string; blurb: string | null; month: string | null; ride: unknown; total_seconds: number | null;
  status: CuratedStatus; created_at?: string; updated_at?: string; published_at?: string | null;
}
interface LinkRow { ride_id: string; service: Service; url: string }

/** What the admin sees for one ride: its text, status and which links it has. */
export interface CuratedSummary {
  id: string; title: string; blurb: string | null; month: string | null; status: CuratedStatus; totalSeconds: number;
  publishedAt: string | null; updatedAt: string | null; links: Links; missing: Service[];
}

/** What a rider sees in the library: a published ride, shaped like any other card, with the link for their service. */
export interface PublishedRide {
  id: string; title: string; blurb: string | null; month: string | null; workout: Workout; services: Service[];
}

/** A database error, with the database's own rule messages passed through (check_violation) so the admin can read why. */
function run<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (res.error.code === "23514") throw new RuleBroken(res.error.message);
    return must(res);
  }
  return res.data;
}

const linksOf = (rows: LinkRow[], rideId: string): Links => Object.fromEntries(rows.filter((r) => r.ride_id === rideId).map((r) => [r.service, r.url]));

/** A curated row as the rides data layer sees a ride row, so the same converters (and the same ride engine) apply. */
export function asRideRow(row: CuratedRow, playlistUrl?: string): RideRow {
  return { id: curatedId(row.id), name: row.title, workout: row.ride, playlist_url: playlistUrl ?? null, total_seconds: row.total_seconds };
}

async function linkRows(ids: string[], c: Client): Promise<LinkRow[]> {
  if (!ids.length) return [];
  return (run(await c.from("curated_playlists").select("*").in("ride_id", ids)) ?? []) as LinkRow[];
}

const summary = (row: CuratedRow, links: Links): CuratedSummary => ({
  id: curatedId(row.id), title: row.title, blurb: row.blurb, month: row.month, status: row.status, totalSeconds: row.total_seconds ?? 0,
  publishedAt: row.published_at ?? null, updatedAt: row.updated_at ?? null, links, missing: missingServices(links),
});

// ---- riders: published rides only (the database hides drafts from them) ------------------------------------------------------

export async function listPublished(service: Service | null, c: Client = db()): Promise<PublishedRide[]> {
  const rows = (run(await c.from("curated_rides").select("*").eq("status", "published").order("published_at", { ascending: false })) ?? []) as CuratedRow[];
  const links = await linkRows(rows.map((r) => r.id), c);
  const out: PublishedRide[] = [];
  for (const row of rows) {
    try {
      const l = linksOf(links, row.id);
      if (service && !l[service]) continue; // a rider only sees rides that have a playlist on their service
      const workout = rowToWorkout(asRideRow(row, service ? l[service] : undefined));
      out.push({ id: curatedId(row.id), title: row.title, blurb: row.blurb, month: row.month, workout, services: SERVICES.filter((s) => l[s]) });
    } catch { /* a ride that cannot be read is left out of the library rather than breaking it */ }
  }
  return out;
}

/**
 * One curated ride and its links. A draft is only for the admin: the database already hides it from riders, and this checks
 * again (draftOk is false for riders), so it looks to a rider exactly like a ride that does not exist.
 */
async function findCurated(id: string, c: Client, draftOk = true): Promise<{ row: CuratedRow; links: Links }> {
  if (!isCuratedId(id)) throw new NotFound(`Ride ${id} not found`);
  const uuid = curatedUuid(id);
  const row = run(await c.from("curated_rides").select("*").eq("id", uuid).maybeSingle()) as CuratedRow | null;
  if (!row || (row.status !== "published" && !draftOk)) throw new NotFound(`Ride ${id} not found`);
  return { row, links: linksOf(await linkRows([uuid], c), uuid) };
}

/** The ride JSON for the ride screen, with the playlist link for this rider's service. */
export async function getCuratedRaw(id: string, service: Service | null, c: Client = db(), draftOk = false): Promise<Record<string, unknown>> {
  const { row, links } = await findCurated(id, c, draftOk);
  return rowToRaw(asRideRow(row, service ? links[service] : undefined));
}
export async function getCuratedWorkout(id: string, service: Service | null, c: Client = db(), draftOk = false): Promise<Workout> {
  const { row, links } = await findCurated(id, c, draftOk);
  return rowToWorkout(asRideRow(row, service ? links[service] : undefined));
}

// ---- the admin: everything, drafts included ------------------------------------------------------------------------------------

export async function listCurated(c: Client = db()): Promise<CuratedSummary[]> {
  const rows = (run(await c.from("curated_rides").select("*").order("updated_at", { ascending: false })) ?? []) as CuratedRow[];
  const links = await linkRows(rows.map((r) => r.id), c);
  return rows.map((r) => summary(r, linksOf(links, r.id)));
}

export async function getCuratedSummary(id: string, c: Client = db()): Promise<CuratedSummary> {
  const { row, links } = await findCurated(id, c);
  return summary(row, links);
}

/** The ride as stored, without an id or a playlist link (links live in their own table, one per service). */
function stripForStorage(ride: Ride): Record<string, unknown> {
  const { id: _id, playlistUrl: _p, sourceId: _s, ...rest } = ride;
  return rest;
}

/** Copies a saved ride into a new draft. The copy is a snapshot: later edits to the original do not change it. */
export async function createCuratedDraft(rideJson: unknown, c: Client = db()): Promise<CuratedSummary> {
  const ride = readRide(rideJson).ride;
  const row = run(await c.from("curated_rides").insert({ title: ride.name, ride: stripForStorage(ride), total_seconds: Math.round(rideDuration(ride)), status: "draft" }).select("*").single()) as CuratedRow;
  return summary(row, {});
}

export interface CuratedPatch { title?: string; blurb?: string | null; month?: string | null; status?: CuratedStatus }

export async function updateCurated(id: string, patch: CuratedPatch, c: Client = db()): Promise<CuratedSummary> {
  const uuid = curatedUuid(id);
  const fields: Record<string, unknown> = {};
  if (patch.title !== undefined) fields.title = patch.title.trim();
  if (patch.blurb !== undefined) fields.blurb = patch.blurb === null || !patch.blurb.trim() ? null : patch.blurb.trim();
  if (patch.month !== undefined) fields.month = patch.month === null || !patch.month.trim() ? null : patch.month.trim();
  if (patch.status !== undefined) fields.status = patch.status;
  if (Object.keys(fields).length) {
    const row = run(await c.from("curated_rides").update(fields).eq("id", uuid).select("*").maybeSingle()) as CuratedRow | null;
    if (!row) throw new NotFound(`Ride ${id} not found`);
  }
  return getCuratedSummary(id, c);
}

/**
 * Sets the playlist links. A service given a link is added or replaced; a service given an empty value is removed (the database
 * refuses that while the ride is published). Anything not mentioned is left alone.
 */
export async function setLinks(id: string, links: Partial<Record<Service, string | null>>, c: Client = db()): Promise<CuratedSummary> {
  const uuid = curatedUuid(id);
  await findCurated(id, c); // 404 for a ride that does not exist
  const have = new Set((await linkRows([uuid], c)).map((r) => r.service));
  const { row } = await findCurated(id, c);
  for (const service of SERVICES) {
    if (!(service in links)) continue;
    const url = (links[service] ?? "").trim();
    if (!url) {
      // A live ride keeps a link for every switched-on service (the database only guarantees at least one).
      if (have.has(service) && row.status === "published" && ACTIVE_SERVICES.includes(service)) {
        throw new RuleBroken(`A live ride needs a ${SERVICE_LABEL[service]} link. Replace it with another one, or unpublish the ride first.`);
      }
      if (have.has(service)) run(await c.from("curated_playlists").delete().eq("ride_id", uuid).eq("service", service));
      continue;
    }
    if (!isHttpsUrl(url)) throw new RuleBroken(`The ${service} link must be a full https:// address with no spaces.`);
    if (have.has(service)) run(await c.from("curated_playlists").update({ url }).eq("ride_id", uuid).eq("service", service));
    else run(await c.from("curated_playlists").insert({ ride_id: uuid, service, url }));
  }
  return getCuratedSummary(id, c);
}

export async function deleteCurated(id: string, c: Client = db()): Promise<void> {
  const gone = (run(await c.from("curated_rides").delete().eq("id", curatedUuid(id)).select("id")) ?? []) as { id: string }[];
  if (!gone.length) throw new NotFound(`Ride ${id} not found`);
}
