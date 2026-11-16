import { Suspense } from "react";
import { redirect } from "next/navigation";
import BuilderLoader from "@/components/BuilderLoader";
import { Unauthorized, isAdmin, requester } from "@/lib/db";

/** /builder/<id> is a ride's details (any signed-in rider). /builder/new is the builder itself: admin only. */
export default async function BuilderPage({ params }: { params: { id: string } }) {
  if (params.id === "new") {
    let ok = false;
    try { ok = await isAdmin(await requester()); }
    catch (e) { if (e instanceof Unauthorized) redirect("/login?next=" + encodeURIComponent("/builder/new")); }
    if (!ok) redirect("/");
  }
  return (
    <Suspense>
      <BuilderLoader id={params.id} />
    </Suspense>
  );
}
