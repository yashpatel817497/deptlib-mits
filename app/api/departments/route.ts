import { fail, ok, parseBody, text } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { Department } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Department names are public so the sign-up form can list them.
    return ok({ departments: (await Department.list()).map((dept) => dept.toDTO()) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await parseBody<{ deptName?: string }>(request);
    const department = await admin.addNewDepartment(text(body.deptName));
    return ok(
      { department, message: `Department "${department.deptName}" created.` },
      201
    );
  } catch (error) {
    return fail(error);
  }
}
