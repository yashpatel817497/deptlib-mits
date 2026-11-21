import { all, one, run } from "../db";
import { addDays, daysBetween, formatDate, nowISO, todayISO } from "../dates";
import { AppError, assert } from "../errors";
import { hashPassword } from "../password";
import { getSettings } from "../settings";
import type {
  BookDTO,
  HistoryEntry,
  IssueRequestDTO,
  PaymentDTO,
  PublicUser,
  RequestDTO,
  ReservationDTO,
  ReviewDTO,
  StudentDashboardDTO,
} from "../types";
import { Book } from "./Book";
import { Department } from "./Department";
import { IssueRequest } from "./IssueRequest";
import { PaymentGateway } from "./PaymentGateway";
import { Reservation } from "./Reservation";
import { Transaction } from "./Transaction";
import { User, type UserRow } from "./User";

interface StudentRow extends UserRow {
  student_id: number;
  department_name: string;
  fine_balance: number;
}

interface RequestRow {
  request_id: number;
  title: string;
  author: string;
  dept_id: number;
  department_name: string;
  student_id: number;
  student_name: string;
  status: RequestDTO["status"];
  review_note: string;
  created_at: string;
  resolved_at: string | null;
}

const SELECT_STUDENT = `
  SELECT u.id, u.username, u.password, u.role, u.status, u.created_at,
         s.student_id, s.department_name, s.fine_balance
  FROM students s
  JOIN users u ON u.id = s.student_id
`;

const RENEWAL_DAYS = 7;

/** A student borrower with all circulation actions. */
export class Student extends User {
  studentId: number;
  departmentName: string;
  fineBalance: number;

  constructor(row: StudentRow) {
    super(row);
    this.studentId = row.student_id;
    this.departmentName = row.department_name;
    this.fineBalance = Number(row.fine_balance);
  }

  static async findByUserId(userId: number): Promise<Student | null> {
    const row = await one<StudentRow>(`${SELECT_STUDENT} WHERE s.student_id = ?`, userId);
    return row ? new Student(row) : null;
  }

  static async findByUsername(username: string): Promise<Student | null> {
    const row = await one<StudentRow>(
      `${SELECT_STUDENT} WHERE u.username = ?`,
      username.trim()
    );
    return row ? new Student(row) : null;
  }

  static async createAccount(input: {
    username: string;
    password: string;
    departmentName: string;
    fullName?: string;
    enrollmentNo?: string;
    semester?: string;
    email?: string;
    phone?: string;
  }): Promise<Student> {
    const username = input.username.trim();
    const password = input.password;
    const departmentName = input.departmentName.trim();
    const fullName = (input.fullName ?? "").trim().replace(/\s+/g, " ");
    const enrollmentNo = (input.enrollmentNo ?? "").trim().toUpperCase();
    const semester = (input.semester ?? "").trim().replace(/\s+/g, " ");
    const email = (input.email ?? "").trim();
    const phone = (input.phone ?? "").replace(/[\s()-]/g, "");

    assert(/^[a-zA-Z0-9._-]{3,30}$/.test(username),
      "Username must be 3–30 characters (letters, numbers, dot, dash or underscore).");
    assert(password.length >= 6, "Password must be at least 6 characters.");
    assert(Boolean(departmentName), "Select your department.");

    const department = await Department.findByName(departmentName);
    assert(department, "Selected department does not exist.", 404);
    assert(!(await User.findByUsername(username)), "That username is already taken.", 409);

    const timestamp = nowISO();
    const passwordHash = hashPassword(password);
    const user = await run(
      "INSERT INTO users (username, password, role, status, created_at) VALUES (?, ?, 'Student', 'Active', ?)",
      username,
      passwordHash,
      timestamp
    );
    const userId = user.lastInsertRowid;
    await run(
      `INSERT INTO students
        (student_id, user_id, username, full_name, enrollment_no, semester, email, phone,
         department_name, fine_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      userId,
      userId,
      username,
      fullName || username,
      enrollmentNo,
      semester,
      email,
      phone,
      department!.deptName
    );
    const created = await Student.findByUserId(userId);
    if (!created) throw new AppError("Could not create the student account.", 500);
    await created.log("REGISTER", `Joined as a ${department!.deptName} student`);
    return created;
  }

  toPublic(): PublicUser {
    return {
      ...super.toPublic(),
      studentId: this.studentId,
      departmentName: this.departmentName,
      fineBalance: this.fineBalance,
    };
  }

  // ---------- Catalogue ----------

  async searchBooks(filters: {
    q?: string;
    deptId?: number | null;
    status?: "Available" | "Issued" | "Lost" | null;
  }): Promise<BookDTO[]> {
    return (await Book.search(filters)).map((book) => book.toDTO());
  }

  async viewAvailableBooks(): Promise<BookDTO[]> {
    return (await Book.search({ status: "Available" })).map((book) => book.toDTO());
  }

  /** Smart picks: own department first, then most-borrowed available titles. */
  async getRecommendations(limit = 6): Promise<BookDTO[]> {
    const ownedActive = new Set(
      (await Transaction.activeForStudent(this.studentId)).map((loan) => loan.bookId)
    );
    const deptId = await this.currentDeptId();
    return (await Book.search({ status: "Available" }))
      .filter((book) => !ownedActive.has(book.bookId))
      .sort((a, b) => {
        const deptA = a.deptId === deptId ? 1 : 0;
        const deptB = b.deptId === deptId ? 1 : 0;
        if (deptA !== deptB) return deptB - deptA;
        if (b.issueCount !== a.issueCount) return b.issueCount - a.issueCount;
        return (b.averageRating ?? 0) - (a.averageRating ?? 0);
      })
      .slice(0, limit)
      .map((book) => book.toDTO());
  }

  private async currentDeptId(): Promise<number | null> {
    const dept = await Department.findByName(this.departmentName);
    return dept?.deptId ?? null;
  }

  // ---------- Circulation ----------

  async issueBook(bookId: number): Promise<{
    loan: Awaited<ReturnType<Transaction["toDTO"]>>;
    message: string;
  }> {
    assert(this.status === "Active", "Your account is suspended. Visit the librarian to restore it.", 403);
    const book = await Book.findById(bookId);
    assert(book, "Book not found.", 404);
    assert(book!.availabilityStatus !== "Lost", "This book is no longer in circulation.", 409);

    // Apply any outstanding waitlist holds before letting someone issue a copy.
    if (book!.availableCopies > 0) await Reservation.promoteNext(bookId);
    const readyHolds = (await Reservation.queueForBook(bookId)).filter(
      (row) => row.status === "Ready"
    );
    assert(
      book!.availableCopies > 0,
      "All copies are issued. Reserve the book to join the waitlist.",
      409
    );
    // Holds claim specific copies. If every free copy is claimed, only a
    // student with a Ready hold may issue; extra unclaimed copies stay open.
    if (book!.availableCopies - readyHolds.length <= 0) {
      assert(
        readyHolds.some((row) => row.studentId === this.studentId),
        "This copy is on hold for another student in the queue.",
        409
      );
    }

    const settings = await getSettings();
    assert(
      this.fineBalance <= settings.maxUnpaidFine,
      `Clear your outstanding fine (above ₹${settings.maxUnpaidFine}) before borrowing.`,
      403
    );

    const active = await Transaction.activeForStudent(this.studentId);
    assert(
      active.length < settings.maxIssueLimit,
      `You already have ${active.length} books issued. The limit is ${settings.maxIssueLimit}.`,
      409
    );
    assert(
      !active.some((loan) => loan.bookId === bookId),
      "You already have a copy of this book issued.",
      409
    );

    const transaction = await Transaction.createIssueRecord({
      studentId: this.studentId,
      bookId,
      borrowDays: settings.borrowDays,
    });
    await book!.checkoutCopy();
    await Reservation.fulfill(bookId, this.studentId);
    await this.log("ISSUE_BOOK", `Issued "${book!.title}" (due ${formatDate(transaction.dueDate)})`);

    return {
      loan: await transaction.toDTO(),
      message: `"${book!.title}" issued. Please return it by ${formatDate(transaction.dueDate)}.`,
    };
  }

  // ---------- Issue requests ----------

  /**
   * Self-service borrowing: a request is queued for the librarian, no copy is
   * deducted and no loan record is created until it is approved.
   */
  async requestIssue(bookId: number): Promise<{ request: IssueRequestDTO; message: string }> {
    assert(this.status === "Active", "Your account is suspended. Visit the librarian to restore it.", 403);
    const book = await Book.findById(bookId);
    assert(book, "Book not found.", 404);
    assert(book!.availabilityStatus !== "Lost", "This book is no longer in circulation.", 409);
    assert(
      book!.availableCopies > 0,
      "All copies are issued right now. Reserve the book to join the waitlist.",
      409
    );
    const active = await Transaction.activeForStudent(this.studentId);
    assert(
      !active.some((loan) => loan.bookId === bookId),
      "You already have a copy of this book issued.",
      409
    );

    const request = await IssueRequest.create(this.studentId, bookId);
    await this.log("REQUEST_ISSUE", `Requested "${book!.title}" for issue`);
    return {
      request: request.toDTO(),
      message: `Request sent for "${book!.title}". The librarian will approve it shortly.`,
    };
  }

  async myIssueRequests(): Promise<IssueRequestDTO[]> {
    return (await IssueRequest.forStudent(this.studentId)).map((request) => request.toDTO());
  }

  async reserveBook(bookId: number): Promise<{ reservation: ReservationDTO; message: string }> {
    const reservation = await Reservation.reserve(this.studentId, bookId);
    const position = await reservation.getPosition();
    await this.log(
      "RESERVE_BOOK",
      `Reserved "${reservation.title}" — queue position #${position}`
    );
    return {
      reservation: await reservation.toDTO(),
      message: `Reserved — you are #${position} in the queue for "${reservation.title}".`,
    };
  }

  async myReservations(): Promise<ReservationDTO[]> {
    return Promise.all(
      (await Reservation.activeForStudent(this.studentId)).map((reservation) =>
        reservation.toDTO()
      )
    );
  }

  async returnBook(transactionId: number): Promise<{
    loan: Awaited<ReturnType<Transaction["toDTO"]>>;
    fine: number;
    fineBalance: number;
    message: string;
  }> {
    const transaction = await Transaction.findById(transactionId);
    assert(transaction, "Loan record not found.", 404);
    assert(transaction!.studentId === this.studentId, "This loan does not belong to you.", 403);
    assert(transaction!.status === "Issued", "This loan is already closed.", 409);

    const fine = await transaction!.calculateFine(todayISO());
    await transaction!.updateReturnRecord({ fine, status: "Returned" });
    const book = await Book.findById(transaction!.bookId);
    if (book) {
      await book.returnCopy();
      await Reservation.promoteNext(book.bookId);
    }

    await run(
      "UPDATE students SET fine_balance = ROUND(fine_balance + ?, 2) WHERE student_id = ?",
      fine,
      this.studentId
    );
    this.fineBalance = Math.round((this.fineBalance + fine) * 100) / 100;
    await this.log(
      "RETURN_BOOK",
      `Returned "${transaction!.title}"${fine > 0 ? ` with a ₹${fine.toFixed(2)} overdue fine` : " on time"}`
    );

    return {
      loan: await transaction!.toDTO(),
      fine,
      fineBalance: this.fineBalance,
      message:
        fine > 0
          ? `Book returned. A ₹${fine.toFixed(2)} overdue fine was added to your account.`
          : "Book returned on time. Thank you!",
    };
  }

  async renewBook(transactionId: number): Promise<{
    loan: Awaited<ReturnType<Transaction["toDTO"]>>;
    message: string;
  }> {
    const transaction = await Transaction.findById(transactionId);
    assert(transaction, "Loan record not found.", 404);
    assert(transaction!.studentId === this.studentId, "This loan does not belong to you.", 403);
    assert(transaction!.status === "Issued", "Only active loans can be renewed.", 409);
    assert(!transaction!.isOverdue(), "Overdue books cannot be renewed. Please return it.", 409);
    assert(transaction!.renewalCount < 1, "This loan has already been renewed once.", 409);

    const newDue = addDays(transaction!.dueDate, RENEWAL_DAYS);
    await transaction!.markRenewed(newDue);
    await this.log("RENEW_BOOK", `Renewed "${transaction!.title}" until ${formatDate(newDue)}`);

    return {
      loan: await transaction!.toDTO(),
      message: `Loan extended by ${RENEWAL_DAYS} days — new due date ${formatDate(newDue)}.`,
    };
  }

  async reportLostBook(transactionId: number): Promise<{
    penalty: number;
    fineBalance: number;
    message: string;
  }> {
    const transaction = await Transaction.findById(transactionId);
    assert(transaction, "Loan record not found.", 404);
    assert(transaction!.studentId === this.studentId, "This loan does not belong to you.", 403);
    assert(transaction!.status === "Issued", "Only active loans can be reported lost.", 409);

    const { lostPenalty } = await getSettings();
    const penalty = Math.round((transaction!.fineCalculated + lostPenalty) * 100) / 100;
    await transaction!.updateReturnRecord({ fine: penalty, status: "Lost" });
    const lostBook = await Book.findById(transaction!.bookId);
    if (lostBook) {
      await lostBook.recordLostCopy();
      await Reservation.promoteNext(lostBook.bookId);
    }
    await run(
      "UPDATE students SET fine_balance = ROUND(fine_balance + ?, 2) WHERE student_id = ?",
      lostPenalty,
      this.studentId
    );
    this.fineBalance = Math.round((this.fineBalance + lostPenalty) * 100) / 100;
    await this.log(
      "LOST_BOOK",
      `Reported "${transaction!.title}" lost — ₹${lostPenalty.toFixed(2)} replacement penalty applied`
    );

    return {
      penalty: lostPenalty,
      fineBalance: this.fineBalance,
      message: `Book marked lost. A ₹${lostPenalty.toFixed(2)} replacement penalty was added.`,
    };
  }

  // ---------- Engagement ----------

  async addBookReview(bookId: number, rating: number, comment: string): Promise<ReviewDTO> {
    const book = await Book.findById(bookId);
    assert(book, "Book not found.", 404);
    const value = Number(rating);
    assert(Number.isInteger(value) && value >= 1 && value <= 5, "Rating must be 1–5 stars.");
    const text = comment.trim().slice(0, 500);

    await run(
      `INSERT INTO book_reviews (book_id, student_id, rating, comment, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (book_id, student_id)
       DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at`,
      bookId,
      this.studentId,
      value,
      text,
      nowISO()
    );
    await this.log("REVIEW", `Reviewed "${book!.title}" (${value}★)`);

    const row = await one<{
      review_id: number;
      book_id: number;
      student_id: number;
      rating: number;
      comment: string;
      created_at: string;
    }>(
      "SELECT * FROM book_reviews WHERE book_id = ? AND student_id = ?",
      bookId,
      this.studentId
    );
    return {
      reviewId: Number(row?.review_id ?? 0),
      bookId,
      studentId: this.studentId,
      studentName: this.username,
      rating: value,
      comment: text,
      createdAt: row?.created_at ?? nowISO(),
    };
  }

  async requestNewBook(input: { title: string; author: string; deptId: number }): Promise<RequestDTO> {
    const title = input.title.trim();
    const author = input.author.trim();
    assert(title.length >= 2, "Enter the book title.");
    assert(author.length >= 2, "Enter the author name.");
    const deptId = Number(input.deptId);
    const department = await Department.findById(deptId);
    assert(department, "Select a valid department.", 404);

    const result = await run(
      `INSERT INTO book_requests (student_id, title, author, dept_id, status, review_note, created_at)
       VALUES (?, ?, ?, ?, 'Pending', '', ?)`,
      this.studentId,
      title,
      author,
      deptId,
      nowISO()
    );
    await this.log("REQUEST_BOOK", `Requested "${title}" by ${author}`);
    const row = await one<RequestRow>(
      `SELECT r.*, d.dept_name AS department_name, s.username AS student_name
       FROM book_requests r
       JOIN departments d ON d.dept_id = r.dept_id
       JOIN students s ON s.student_id = r.student_id
       WHERE r.request_id = ?`,
      result.lastInsertRowid
    );
    return {
      requestId: Number(row?.request_id ?? 0),
      title,
      author,
      deptId,
      departmentName: department!.deptName,
      studentId: this.studentId,
      studentName: this.username,
      status: "Pending",
      reviewNote: "",
      createdAt: row?.created_at ?? nowISO(),
      resolvedAt: null,
    };
  }

  async myRequests(): Promise<RequestDTO[]> {
    return (
      await all<RequestRow>(
        `SELECT r.*, d.dept_name AS department_name, s.username AS student_name
         FROM book_requests r
         JOIN departments d ON d.dept_id = r.dept_id
         JOIN students s ON s.student_id = r.student_id
         WHERE r.student_id = ?
         ORDER BY r.created_at DESC`,
        this.studentId
      )
    ).map((row) => ({
      requestId: row.request_id,
      title: row.title,
      author: row.author,
      deptId: row.dept_id,
      departmentName: row.department_name,
      studentId: row.student_id,
      studentName: row.student_name,
      status: row.status,
      reviewNote: row.review_note,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }));
  }

  // ---------- Fines ----------

  async payFine(method: "UPI" | "Card"): Promise<{
    payment: PaymentDTO & { balanceAfter: number };
    message: string;
  }> {
    assert(method === "UPI" || method === "Card", "Choose UPI or Card.");
    assert(this.fineBalance > 0, "You have no outstanding fine.");

    const gateway = await PaymentGateway.processPayment({
      studentId: this.studentId,
      amount: this.fineBalance,
      method,
      actorUserId: this.id,
    });
    const receipt = await PaymentGateway.generateReceipt(gateway.paymentReferenceId);
    this.fineBalance = 0;
    if (!receipt) throw new AppError("Payment succeeded but the receipt could not be generated.", 500);

    return {
      payment: receipt,
      message: "Payment successful. Your fine balance is now ₹0.00.",
    };
  }

  // ---------- History & dashboard ----------

  async getLoans(): Promise<Awaited<ReturnType<Transaction["toDTO"]>>[]> {
    return Promise.all((await Transaction.forStudent(this.studentId)).map((loan) => loan.toDTO()));
  }

  async getDashboard(): Promise<StudentDashboardDTO> {
    const loans = await this.getLoans();
    const active = loans.filter((loan) => loan.status === "Issued");
    const settings = await getSettings();
    const today = todayISO();
    const pending = await one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM book_requests WHERE student_id = ? AND status = 'Pending'",
      this.studentId
    );
    const reservations = await this.myReservations();

    // Any loan due within 48 hours, due today, or already overdue is surfaced
    // at the top of the student dashboard.
    const dueAlerts = active
      .map((loan) => ({
        transactionId: loan.transactionId,
        bookId: loan.bookId,
        title: loan.title,
        dueDate: loan.dueDate,
        daysUntilDue: daysBetween(today, loan.dueDate),
        overdue: loan.daysOverdue > 0,
      }))
      .filter((alert) => alert.daysUntilDue <= 2)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    return {
      stats: {
        activeLoans: active.length,
        overdueLoans: active.filter((loan) => loan.daysOverdue > 0).length,
        returnedLoans: loans.filter((loan) => loan.status === "Returned").length,
        fineBalance: this.fineBalance,
        maxIssueLimit: settings.maxIssueLimit,
        pendingRequests: Number(pending?.count ?? 0),
        reservations: reservations.length,
      },
      loans: active,
      reservations,
      dueAlerts,
      fineRate: settings.fineRate,
      issueRequests: await this.myIssueRequests(),
    };
  }

  async checkHistory(): Promise<HistoryEntry[]> {
    const rows: HistoryEntry[] = [];

    const transactions = await all<{
      transaction_id: number;
      title: string;
      status: string;
      issue_date: string;
      due_date: string;
      return_date: string | null;
      fine_calculated: number;
      created_at: string;
    }>(
      `SELECT t.transaction_id, b.title, t.status, t.issue_date, t.due_date, t.return_date, t.fine_calculated, t.created_at
       FROM transactions t JOIN books b ON b.book_id = t.book_id
       WHERE t.student_id = ? ORDER BY t.created_at DESC`,
      this.studentId
    );
    for (const row of transactions) {
      const kind =
        row.status === "Returned" ? "Return" : row.status === "Lost" ? "Lost" : "Loan";
      const title =
        row.status === "Returned"
          ? `Returned "${row.title}"`
          : row.status === "Lost"
            ? `Lost "${row.title}"`
            : `Issued "${row.title}"`;
      rows.push({
        kind,
        title,
        detail:
          row.status === "Returned"
            ? `Issued ${formatDate(row.issue_date)} • returned ${formatDate(row.return_date)}`
            : `Issued ${formatDate(row.issue_date)} • due ${formatDate(row.due_date)}`,
        date: row.created_at,
        amount: Number(row.fine_calculated) || undefined,
      });
    }

    for (const payment of await PaymentGateway.history(this.studentId)) {
      rows.push({
        kind: "Payment",
        title: `Fine payment ${payment.paymentStatus.toLowerCase()}`,
        detail: `${payment.method} • ${payment.paymentReferenceId}`,
        date: payment.timestamp,
        amount: payment.amount,
      });
    }

    const activity = await all<{ action: string; detail: string; created_at: string }>(
      "SELECT action, detail, created_at FROM activity_log WHERE user_id = ?",
      this.id
    );
    for (const row of activity) {
      rows.push({
        kind: "Activity",
        title: row.action.replaceAll("_", " ").toLowerCase(),
        detail: row.detail,
        date: row.created_at,
      });
    }

    return rows
      .filter(
        (row) =>
          !(row.kind === "Activity" && ["LOGIN", "LOGOUT"].includes(row.title.toUpperCase()))
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 100);
  }

  static async hydrate(user: User): Promise<Student> {
    const student = await Student.findByUserId(user.id);
    if (!student) throw new AppError("Student profile not found.", 404);
    return student;
  }
}
