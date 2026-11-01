import { Suspense } from "react";
import BuilderLoader from "@/components/BuilderLoader";

export default function BuilderPage({ params }: { params: { id: string } }) {
  return (
    <Suspense>
      <BuilderLoader id={params.id} />
    </Suspense>
  );
}
