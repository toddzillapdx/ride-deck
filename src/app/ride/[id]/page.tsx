import RideLoader from "@/components/RideLoader";

export default function RidePage({ params }: { params: { id: string } }) {
  return <RideLoader id={params.id} />;
}
