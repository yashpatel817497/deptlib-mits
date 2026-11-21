import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Admin } from "@/lib/domain";
import { LoginView } from "@/components/LoginView";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user && user.status === "Active") {
    redirect(user.role === "Admin" ? "/admin" : "/student");
  }
  return <LoginView needsSetup={(await Admin.count()) === 0} />;
}
