"use client";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Music planning now lives in the builder (the PLAN MUSIC tab). Old links land there. */
function Redirect() {
  const ride = useSearchParams().get("ride");
  useEffect(() => { window.location.replace(ride ? `/builder/${encodeURIComponent(ride)}` : "/builder/new?tab=music"); }, [ride]);
  return <div className="fixed inset-0 bg-ground" />;
}

export default function MusicPage() {
  return <Suspense><Redirect /></Suspense>;
}
