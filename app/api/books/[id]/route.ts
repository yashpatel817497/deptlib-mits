import { fail, ok, parseBody, text, toId } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/auth";
import { Book, Reservation } from "@/lib/domain";
import { one } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const book = await Book.findById(toId(id, "book"));
    if (!book) throw new AppError("Book not found.", 404);

    const active = await one<{
      transaction_id: number;
      student_id: number;
      student_name: string;
      due_date: string;
    }>(
      `SELECT t.transaction_id, t.student_id, s.username AS student_name, t.due_date
       FROM transactions t JOIN students s ON s.student_id = t.student_id
       WHERE t.book_id = ? AND t.status = 'Issued' LIMIT 1`,
      book.bookId
    );

    const details = await book.getDetails();
    const decorated =
      user.role === "Student"
        ? (await Reservation.decorate([details], user.id))[0]
        : details;

    return ok({
      book: {
        ...decorated,
        activeLoan: active
          ? {
              transactionId: active.transaction_id,
              studentId: active.student_id,
              studentName: active.student_name,
              dueDate: active.due_date,
            }
          : null,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await parseBody<{
      title?: string;
      author?: string;
      isbn?: string;
      category?: string;
      deptId?: number;
      coverVariant?: number | null;
      replacementCost?: number;
      copies?: number;
    }>(request);

    const book = await admin.updateBookDetails(toId(id, "book"), {
      title: body.title !== undefined ? text(body.title) : undefined,
      author: body.author !== undefined ? text(body.author) : undefined,
      isbn: body.isbn !== undefined ? text(body.isbn) : undefined,
      category: body.category !== undefined ? text(body.category) : undefined,
      deptId: body.deptId !== undefined ? toId(body.deptId, "department") : undefined,
      coverVariant:
        body.coverVariant === undefined
          ? undefined
          : body.coverVariant === null
            ? null
            : Number(body.coverVariant),
      replacementCost:
        body.replacementCost !== undefined ? Number(body.replacementCost) : undefined,
      copies: body.copies !== undefined ? Number(body.copies) : undefined,
    });

    return ok({ book, message: `"${book.title}" updated.` });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    return ok(await admin.deleteBook(toId(id, "book")));
  } catch (error) {
    return fail(error);
  }
}
