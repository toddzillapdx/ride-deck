import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Unauthorized, isAdmin, requester } from "@/lib/db";

/** /music forwards to the builder, which is admin-only. */
export default async function MusicLayout({ children }: { children: ReactNode }) {
  let ok = false;
  try { ok = await isAdmin(await requester()); }
  catch (e) { if (e instanceof Unauthorized) redirect("/login"); }
  if (!ok) redirect("/");
  return <>{children}</>;
}
