import { fail, ok, parseBody, text } from "@/lib/api";
import { requireStudent, requireUser } from "@/lib/auth";
import { PaymentGateway, Student } from "@/lib/domain";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const reference = url.searchParams.get("ref");

    if (reference) {
      const receipt = await PaymentGateway.generateReceipt(reference);
      if (!receipt) throw new AppError("Receipt not found.", 404);
      if (user.role === "Student") {
        const student = await Student.hydrate(user);
        if (receipt.studentId !== student.studentId) {
          throw new AppError("This receipt does not belong to you.", 403);
        }
      }
      return ok({ receipt });
    }

    if (user.role === "Student") {
      const student = await Student.hydrate(user);
      return ok({ payments: await PaymentGateway.history(student.studentId) });
    }
    return ok({ payments: await PaymentGateway.all() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const student = await requireStudent();
    const body = await parseBody<{ method?: string }>(request);
    const method = text(body.method);
    if (method !== "UPI" && method !== "Card") {
      throw new AppError("Choose a payment method (UPI or Card).");
    }
    return ok(await student.payFine(method));
  } catch (error) {
    return fail(error);
  }
}
