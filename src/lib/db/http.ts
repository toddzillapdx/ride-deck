import { NextResponse } from "next/server";
import { NotConfigured, NotFound, Unauthorized } from "./client";

/** One place that turns a data error into the right HTTP answer, so every route says the same thing. */
export function failResponse(e: unknown, extra: Record<string, unknown> = {}): NextResponse {
  if (e instanceof Unauthorized) return NextResponse.json({ ...extra, error: e.message, code: "signin" }, { status: 401 });
  if (e instanceof NotConfigured) return NextResponse.json({ ...extra, error: e.message }, { status: 503 });
  if (e instanceof NotFound) return NextResponse.json({ ...extra, error: e.message }, { status: 404 });
  return NextResponse.json({ ...extra, error: (e as Error).message }, { status: 502 });
}
