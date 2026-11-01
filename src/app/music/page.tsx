import { Suspense } from "react";
import MusicPlanner from "@/components/MusicPlanner";

export default function MusicPage() {
  return (
    <Suspense>
      <MusicPlanner />
    </Suspense>
  );
}
