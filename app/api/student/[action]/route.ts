import { fail, ok, parseBody, toId } from "@/lib/api";
import { requireStudent } from "@/lib/auth";
import { PaymentGateway, Reservation } from "@/lib/domain";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ action: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { action } = await params;
  try {
    const student = await requireStudent();
    switch (action) {
      case "dashboard": {
        const dashboard = await student.getDashboard();
        return ok({ user: student.toPublic(), ...dashboard });
      }
      case "history":
        return ok({ history: await student.checkHistory() });
      case "requests":
        return ok({ requests: await student.myRequests() });
      case "receipts":
        return ok({ payments: await PaymentGateway.history(student.studentId) });
      case "recommendations":
        return ok({
          books: await Reservation.decorate(
            await student.getRecommendations(),
            student.studentId
          ),
        });
      default:
        throw new AppError("Unknown student action.", 404);
    }
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  const { action } = await params;
  try {
    const student = await requireStudent();
    switch (action) {
      case "issue": {
        const body = await parseBody<{ bookId?: number }>(request);
        return ok(await student.issueBook(toId(body.bookId, "book")));
      }
      case "request-issue": {
        const body = await parseBody<{ bookId?: number }>(request);
        return ok(await student.requestIssue(toId(body.bookId, "book")), 201);
      }
      case "reserve": {
        const body = await parseBody<{ bookId?: number }>(request);
        return ok(await student.reserveBook(toId(body.bookId, "book")), 201);
      }
      case "return": {
        const body = await parseBody<{ transactionId?: number }>(request);
        return ok(await student.returnBook(toId(body.transactionId, "loan")));
      }
      case "renew": {
        const body = await parseBody<{ transactionId?: number }>(request);
        return ok(await student.renewBook(toId(body.transactionId, "loan")));
      }
      case "lost": {
        const body = await parseBody<{ transactionId?: number }>(request);
        return ok(await student.reportLostBook(toId(body.transactionId, "loan")));
      }
      case "review": {
        const body = await parseBody<{ bookId?: number; rating?: number; comment?: string }>(request);
        const review = await student.addBookReview(
          toId(body.bookId, "book"),
          Number(body.rating),
          typeof body.comment === "string" ? body.comment : ""
        );
        return ok({ review, message: "Thanks! Your review has been saved." }, 201);
      }
      case "request": {
        const body = await parseBody<{ title?: string; author?: string; deptId?: number }>(request);
        const newRequest = await student.requestNewBook({
          title: typeof body.title === "string" ? body.title : "",
          author: typeof body.author === "string" ? body.author : "",
          deptId: toId(body.deptId, "department"),
        });
        return ok({ request: newRequest, message: "Request submitted for librarian review." }, 201);
      }
      default:
        throw new AppError("Unknown student action.", 404);
    }
  } catch (error) {
    return fail(error);
  }
}
