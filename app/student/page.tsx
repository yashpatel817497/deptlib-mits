import { redirect } from "next/navigation";
import { getSessionUser, publicUserFor } from "@/lib/auth";
import { StudentPortal } from "@/components/student/StudentPortal";
import { SuspendedScreen } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "Student") redirect("/admin");
  if (user.status === "Suspended") return <SuspendedScreen username={user.username} />;

  return <StudentPortal initialUser={await publicUserFor(user)} />;
}
