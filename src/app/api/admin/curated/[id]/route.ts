import { NextResponse } from "next/server";
import { NotFound, deleteCurated, failResponse, getCuratedSummary, isCuratedId, requireAdmin, setLinks, updateCurated, type CuratedPatch } from "@/lib/db";
import { SERVICES, SERVICE_LABEL, isHttpsUrl, missingServices, type Service } from "@/lib/services";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };
const bad = (id: string) => (isCuratedId(id) ? null : NextResponse.json({ error: "Not a published-ride id" }, { status: 404 }));

export async function GET(_req: Request, { params }: Ctx) {
  const no = bad(params.id); if (no) return no;
  try { const { client } = await requireAdmin(); return NextResponse.json(await getCuratedSummary(params.id, client)); } catch (e) { return failResponse(e); }
}

/**
 * Admin: change a curated ride. Body (all optional): { title, blurb, month, links: { spotify, apple, amazon }, status }.
 * Links are saved first, then the rest, so one request can add the last link and publish. The database enforces the rules
 * (a link for every switched-on service before publishing, no losing a link while live, segments locked) and its message comes back as a 400.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const no = bad(params.id); if (no) return no;
  let body: { title?: unknown; blurb?: unknown; month?: unknown; links?: unknown; status?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  const patch: CuratedPatch = {};
  if (body.title !== undefined) { if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120) return NextResponse.json({ error: "Title must be 1 to 120 characters" }, { status: 400 }); patch.title = body.title; }
  if (body.blurb !== undefined) { if (body.blurb !== null && (typeof body.blurb !== "string" || body.blurb.length > 600)) return NextResponse.json({ error: "Description must be 600 characters or fewer" }, { status: 400 }); patch.blurb = body.blurb as string | null; }
  if (body.month !== undefined) { if (body.month !== null && body.month !== "" && !(typeof body.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.month))) return NextResponse.json({ error: "Month looks like 2027-01 (or leave it empty)" }, { status: 400 }); patch.month = (body.month || null) as string | null; }
  if (body.status !== undefined) { if (body.status !== "draft" && body.status !== "published") return NextResponse.json({ error: "status must be draft or published" }, { status: 400 }); patch.status = body.status; }
  let links: Partial<Record<Service, string | null>> | undefined;
  if (body.links !== undefined) {
    if (!body.links || typeof body.links !== "object") return NextResponse.json({ error: "links must be an object" }, { status: 400 });
    links = {};
    for (const s of SERVICES) {
      const v = (body.links as Record<string, unknown>)[s];
      if (v === undefined) continue;
      if (v !== null && typeof v !== "string") return NextResponse.json({ error: `The ${s} link must be text` }, { status: 400 });
      if (typeof v === "string" && v.trim() && !isHttpsUrl(v.trim())) return NextResponse.json({ error: `The ${s} link must be a full https:// address with no spaces.` }, { status: 400 });
      links[s] = v === null ? null : v.trim();
    }
  }
  try {
    const { client } = await requireAdmin();
    if (patch.status === "published") {
      // Say it plainly before touching anything. (The database refuses it too.)
      const after = { ...(await getCuratedSummary(params.id, client)).links, ...Object.fromEntries(Object.entries(links ?? {}).filter(([, v]) => v !== undefined)) } as Record<string, string | null>;
      const missing = missingServices(after);
      if (missing.length) return NextResponse.json({ error: `Add a playlist link for ${missing.map((m) => SERVICE_LABEL[m]).join(", ")} before publishing.`, code: "rule" }, { status: 400 });
    }
    if (links) await setLinks(params.id, links, client);
    return NextResponse.json(await updateCurated(params.id, patch, client));
  } catch (e) { return failResponse(e); }
}

/** Admin: delete a draft. A published ride must be unpublished first (the database refuses otherwise). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const no = bad(params.id); if (no) return no;
  try { const { client } = await requireAdmin(); await deleteCurated(params.id, client); return NextResponse.json({ ok: true }); }
  catch (e) { return e instanceof NotFound ? failResponse(e) : failResponse(e); }
}
