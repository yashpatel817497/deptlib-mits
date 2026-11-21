import { all, one, run } from "../db";
import { nowISO } from "../dates";
import { AppError, assert } from "../errors";
import type { BookDTO, ReservationBriefDTO, ReservationDTO } from "../types";
import { Book } from "./Book";

interface ReservationRow {
  reservation_id: number;
  book_id: number;
  student_id: number;
  status: ReservationDTO["status"];
  created_at: string;
  notified_at: string | null;
  title: string;
  author: string;
  student_name: string;
}

const BASE_SELECT = `
  SELECT r.*, b.title, b.author, s.username AS student_name
  FROM reservations r
  JOIN books b ON b.book_id = r.book_id
  JOIN students s ON s.student_id = r.student_id
`;

const ACTIVE = "('Waiting', 'Ready')";

/** FIFO waitlist for a fully issued title. */
export class Reservation {
  reservationId: number;
  bookId: number;
  studentId: number;
  status: ReservationDTO["status"];
  createdAt: string;
  notifiedAt: string | null;
  title: string;
  author: string;
  studentName: string;

  constructor(row: ReservationRow) {
    this.reservationId = row.reservation_id;
    this.bookId = row.book_id;
    this.studentId = row.student_id;
    this.status = row.status;
    this.createdAt = row.created_at;
    this.notifiedAt = row.notified_at;
    this.title = row.title;
    this.author = row.author;
    this.studentName = row.student_name;
  }

  static async findById(reservationId: number): Promise<Reservation | null> {
    const row = await one<ReservationRow>(
      `${BASE_SELECT} WHERE r.reservation_id = ?`,
      reservationId
    );
    return row ? new Reservation(row) : null;
  }

  static async findActive(bookId: number, studentId: number): Promise<Reservation | null> {
    const row = await one<ReservationRow>(
      `${BASE_SELECT} WHERE r.book_id = ? AND r.student_id = ? AND r.status IN ${ACTIVE}`,
      bookId,
      studentId
    );
    return row ? new Reservation(row) : null;
  }

  static async activeForStudent(studentId: number): Promise<Reservation[]> {
    return (
      await all<ReservationRow>(
        `${BASE_SELECT} WHERE r.student_id = ? AND r.status IN ${ACTIVE}
         ORDER BY r.created_at, r.reservation_id`,
        studentId
      )
    ).map((row) => new Reservation(row));
  }

  static async queueForBook(bookId: number): Promise<Reservation[]> {
    return (
      await all<ReservationRow>(
        `${BASE_SELECT} WHERE r.book_id = ? AND r.status IN ${ACTIVE}
         ORDER BY r.created_at, r.reservation_id`,
        bookId
      )
    ).map((row) => new Reservation(row));
  }

  static async queueLength(bookId: number): Promise<number> {
    return Number(
      (
        await one<{ count: number }>(
          `SELECT COUNT(*) AS count FROM reservations WHERE book_id = ? AND status IN ${ACTIVE}`,
          bookId
        )
      )?.count ?? 0
    );
  }

  /** Adds the student to the back of the queue for a fully issued title. */
  static async reserve(studentId: number, bookId: number): Promise<Reservation> {
    const student = await one<{ status: string }>(
      "SELECT u.status FROM students s JOIN users u ON u.id = s.student_id WHERE s.student_id = ?",
      studentId
    );
    assert(student, "Student not found.", 404);
    assert(student!.status === "Active", "Your account is suspended. Visit the librarian.", 403);

    const book = await Book.findById(bookId);
    assert(book, "Book not found.", 404);
    assert(book!.availabilityStatus !== "Lost", "This title is no longer in circulation.", 409);
    assert(
      book!.availableCopies === 0,
      "Copies are available — issue the book instead of reserving it.",
      409
    );

    const activeLoan = await one<{ transaction_id: number }>(
      "SELECT transaction_id FROM transactions WHERE student_id = ? AND book_id = ? AND status = 'Issued'",
      studentId,
      bookId
    );
    assert(!activeLoan, "You already have a copy of this book issued.", 409);
    assert(
      !(await Reservation.findActive(bookId, studentId)),
      "You already have a reservation for this book.",
      409
    );

    const result = await run(
      "INSERT INTO reservations (book_id, student_id, status, created_at) VALUES (?, ?, 'Waiting', ?)",
      bookId,
      studentId,
      nowISO()
    );
    const created = await Reservation.findById(result.lastInsertRowid);
    if (!created) throw new AppError("Could not create the reservation.", 500);
    return created;
  }

  /** FIFO position including a Ready hold ahead of the line. */
  async getPosition(): Promise<number> {
    const queue = await Reservation.queueForBook(this.bookId);
    const index = queue.findIndex((row) => row.reservationId === this.reservationId);
    return index >= 0 ? index + 1 : queue.length + 1;
  }

  async toDTO(): Promise<ReservationDTO> {
    return {
      reservationId: this.reservationId,
      bookId: this.bookId,
      studentId: this.studentId,
      studentName: this.studentName,
      title: this.title,
      author: this.author,
      status: this.status,
      position: await this.getPosition(),
      createdAt: this.createdAt,
      notifiedAt: this.notifiedAt,
    };
  }

  async toBrief(): Promise<ReservationBriefDTO> {
    return {
      reservationId: this.reservationId,
      bookId: this.bookId,
      status: this.status,
      position: await this.getPosition(),
      createdAt: this.createdAt,
      notifiedAt: this.notifiedAt,
    };
  }

  /** Closes the student's queue entry once they issue a copy of the title. */
  static async fulfill(bookId: number, studentId: number): Promise<void> {
    await run(
      "UPDATE reservations SET status = 'Fulfilled' WHERE book_id = ? AND student_id = ? AND status IN ('Waiting', 'Ready')",
      bookId,
      studentId
    );
  }

  /**
   * Called after a copy comes back: promotes the oldest waiting students to
   * Ready (up to the number of free copies) and stamps their notification.
   */
  static async promoteNext(bookId: number): Promise<number> {
    const book = await Book.findById(bookId);
    if (!book || book.availableCopies <= 0 || book.availabilityStatus === "Lost") return 0;

    const ready = Number(
      (
        await one<{ count: number }>(
          "SELECT COUNT(*) AS count FROM reservations WHERE book_id = ? AND status = 'Ready'",
          bookId
        )
      )?.count ?? 0
    );
    const slots = book.availableCopies - ready;
    if (slots <= 0) return 0;

    const waiting = await all<{ reservation_id: number }>(
      `SELECT reservation_id FROM reservations
       WHERE book_id = ? AND status = 'Waiting'
       ORDER BY created_at, reservation_id LIMIT ?`,
      bookId,
      slots
    );
    for (const row of waiting) {
      await run(
        "UPDATE reservations SET status = 'Ready', notified_at = ? WHERE reservation_id = ?",
        nowISO(),
        row.reservation_id
      );
    }
    return waiting.length;
  }

  /** Adds this student's reservation/queue-hold state to catalogue DTOs. */
  static async decorate(books: BookDTO[], studentId: number): Promise<BookDTO[]> {
    const mine = new Map<number, ReservationBriefDTO>();
    for (const reservation of await Reservation.activeForStudent(studentId)) {
      mine.set(reservation.bookId, await reservation.toBrief());
    }
    const heldElsewhere = new Set(
      (
        await all<{ book_id: number }>(
          "SELECT DISTINCT book_id FROM reservations WHERE status = 'Ready' AND student_id <> ?",
          studentId
        )
      ).map((row) => row.book_id)
    );

    return books.map((book) => {
      const reservation = mine.get(book.bookId) ?? null;
      return {
        ...book,
        myReservation: reservation,
        holdForOther: !reservation && heldElsewhere.has(book.bookId),
      };
    });
  }
}
