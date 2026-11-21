import { fail, ok, parseBody, toId, text } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/auth";
import { Book, Reservation } from "@/lib/domain";
import type { Availability } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: Availability[] = ["Available", "Issued", "Lost"];

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const deptParam = url.searchParams.get("deptId");
    const statusParam = url.searchParams.get("status");
    const status = STATUSES.includes(statusParam as Availability)
      ? (statusParam as Availability)
      : null;

    const books = (await Book.search({
      q,
      deptId: deptParam ? Number(deptParam) : null,
      status,
    })).map((book) => book.toDTO());
    return ok({
      books:
        user.role === "Student"
          ? await Reservation.decorate(books, user.id)
          : books,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await parseBody<{
      title?: string;
      author?: string;
      deptId?: number;
      replacementCost?: number;
      copies?: number;
    }>(request);
    const book = await admin.addNewBook({
      title: text(body.title),
      author: text(body.author),
      deptId: toId(body.deptId, "department"),
      replacementCost: body.replacementCost ? Number(body.replacementCost) : undefined,
      copies: body.copies !== undefined ? Number(body.copies) : undefined,
    });
    return ok({ book, message: `"${book.title}" added to the catalogue.` }, 201);
  } catch (error) {
    return fail(error);
  }
}
