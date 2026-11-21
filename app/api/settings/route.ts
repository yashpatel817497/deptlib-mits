import { fail, ok, parseBody } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return ok({ settings: await getSettings() });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await parseBody<Record<string, unknown>>(request);
    const hasPolicy =
      body.fineRate !== undefined ||
      body.graceDays !== undefined ||
      body.lostPenalty !== undefined ||
      body.maxUnpaidFine !== undefined;

    if (hasPolicy) {
      await admin.customizeFinePolicy({
        fineRate: body.fineRate !== undefined ? Number(body.fineRate) : undefined,
        graceDays: body.graceDays !== undefined ? Number(body.graceDays) : undefined,
        lostPenalty: body.lostPenalty !== undefined ? Number(body.lostPenalty) : undefined,
        maxUnpaidFine: body.maxUnpaidFine !== undefined ? Number(body.maxUnpaidFine) : undefined,
      });
    }
    if (body.maxIssueLimit !== undefined) {
      await admin.setMaxIssueLimit(Number(body.maxIssueLimit));
    }
    if (body.borrowDays !== undefined) {
      await admin.setBorrowPeriod(Number(body.borrowDays));
    }

    return ok({ settings: await getSettings(), message: "Library policy updated." });
  } catch (error) {
    return fail(error);
  }
}
