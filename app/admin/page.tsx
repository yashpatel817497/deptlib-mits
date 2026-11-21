import { redirect } from "next/navigation";
import { getSessionUser, publicUserFor } from "@/lib/auth";
import { AdminPortal } from "@/components/admin/AdminPortal";
import { SuspendedScreen } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "Admin") redirect("/student");
  if (user.status === "Suspended") return <SuspendedScreen username={user.username} />;

  return <AdminPortal initialUser={await publicUserFor(user)} />;
}
