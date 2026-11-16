import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Unauthorized, isAdmin, requester } from "@/lib/db";

/** Everything under /admin is for the admin only. The routes behind it check again; this keeps riders from even seeing the screens. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  let ok = false;
  try { ok = await isAdmin(await requester()); }
  catch (e) { if (e instanceof Unauthorized) redirect("/login"); }
  if (!ok) redirect("/");
  return <>{children}</>;
}
