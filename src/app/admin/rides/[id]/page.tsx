import AdminRideEditor from "@/components/AdminRideEditor";

export default function AdminRideEditorPage({ params }: { params: { id: string } }) { return <AdminRideEditor id={params.id} />; }
