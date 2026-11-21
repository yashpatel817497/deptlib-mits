import { all, one, run } from "../db";
import { formatDate, nowISO, todayISO } from "../dates";
import { AppError, assert } from "../errors";
import { hashPassword } from "../password";
import { getSettings, updateSettings, type Settings } from "../settings";
import type {
  AdminStudentDTO,
  AnnouncementDTO,
  BookDTO,
  DepartmentDTO,
  IssueRequestDTO,
  IssueRequestStatus,
  LoanDTO,
  PublicUser,
  ReportDTO,
  RequestDTO,
  RequestStatus,
  SettingsDTO,
  UserStatus,
} from "../types";
import { Book } from "./Book";
import { Department } from "./Department";
import { IssueRequest } from "./IssueRequest";
import { Reservation } from "./Reservation";
import { Student } from "./Student";
import { Transaction } from "./Transaction";
import { User, type UserRow } from "./User";

interface AdminRow extends UserRow {
  admin_id: number;
}

interface RequestRow {
  request_id: number;
  title: string;
  author: string;
  dept_id: number;
  department_name: string;
  student_id: number;
  student_name: string;
  status: RequestStatus;
  review_note: string;
  created_at: string;
  resolved_at: string | null;
}

const TABLES = [
  "users",
  "admins",
  "students",
  "departments",
  "books",
  "reservations",
  "issue_requests",
  "book_reviews",
  "transactions",
  "payments",
  "settings",
  "announcements",
  "book_requests",
  "activity_log",
];

/** The librarian role: catalogue, policy, accounts and reports. */
export class Admin extends User {
  adminId: number;

  constructor(row: AdminRow) {
    super(row);
    this.adminId = row.admin_id;
  }

  static async findByUserId(userId: number): Promise<Admin | null> {
    const row = await one<AdminRow>(
      `SELECT u.id, u.username, u.password, u.role, u.status, u.created_at, a.admin_id
       FROM admins a JOIN users u ON u.id = a.admin_id
       WHERE a.admin_id = ?`,
      userId
    );
    return row ? new Admin(row) : null;
  }

  static async createAccount(input: { username: string; password: string }): Promise<Admin> {
    const username = input.username.trim();
    assert(/^[a-zA-Z0-9._-]{3,30}$/.test(username),
      "Username must be 3–30 characters (letters, numbers, dot, dash or underscore).");
    assert(input.password.length >= 6, "Password must be at least 6 characters.");
    assert(!(await User.findByUsername(username)), "That username is already taken.", 409);

    const passwordHash = hashPassword(input.password);
    const timestamp = nowISO();
    const user = await run(
      "INSERT INTO users (username, password, role, status, created_at) VALUES (?, ?, 'Admin', 'Active', ?)",
      username,
      passwordHash,
      timestamp
    );
    await run(
      "INSERT INTO admins (admin_id, user_id, username, password) VALUES (?, ?, ?, ?)",
      user.lastInsertRowid,
      user.lastInsertRowid,
      username,
      passwordHash
    );
    const admin = await Admin.findByUserId(user.lastInsertRowid);
    if (!admin) throw new AppError("Could not create the administrator account.", 500);
    await admin.log("REGISTER", "Administrator account created");
    return admin;
  }

  static async hydrate(user: User): Promise<Admin> {
    const admin = await Admin.findByUserId(user.id);
    if (!admin) throw new AppError("Administrator profile not found.", 404);
    return admin;
  }

  /** Number of administrator accounts — drives the public first-run setup gate. */
  static async count(): Promise<number> {
    return Number(
      (await one<{ count: number }>("SELECT COUNT(*) AS count FROM admins"))?.count ?? 0
    );
  }

  /** Creates a student from inside the admin console. */
  async createStudentAccount(input: {
    username: string;
    password: string;
    departmentName: string;
  }): Promise<PublicUser> {
    const student = await Student.createAccount(input);
    await this.log(
      "CREATE_USER",
      `Created student account ${student.username} (${student.departmentName})`
    );
    return student.toPublic();
  }

  /** Registers a student with a full profile and login credentials ready to use. */
  async registerStudent(input: {
    fullName: string;
    enrollmentNo: string;
    email: string;
    departmentName: string;
    semester: string;
    username: string;
    password: string;
  }): Promise<{ student: AdminStudentDTO; message: string }> {
    const fullName = input.fullName.trim().replace(/\s+/g, " ");
    const enrollmentNo = input.enrollmentNo.trim().toUpperCase();
    const email = input.email.trim();
    const semester = input.semester.trim().replace(/\s+/g, " ");
    const username = input.username.trim().toLowerCase();

    assert(fullName.length >= 2 && fullName.length <= 80, "Full name must be 2–80 characters.");
    assert(
      /^[A-Z0-9/-]{3,20}$/.test(enrollmentNo),
      "Enrollment number must be 3–20 characters (letters, numbers, / or -)."
    );
    assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Enter a valid email address.");
    assert(semester.length >= 1 && semester.length <= 20, "Enter the semester or year.");
    assert(
      /^[a-zA-Z0-9._-]{3,30}$/.test(username),
      "Username must be 3–30 characters (letters, numbers, dot, dash or underscore)."
    );
    assert(input.password.length >= 6, "Temporary password must be at least 6 characters.");

    const duplicateEnrollment = await one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM students WHERE UPPER(enrollment_no) = ?",
      enrollmentNo
    );
    assert(
      Number(duplicateEnrollment?.count ?? 0) === 0,
      "That enrollment number is already registered.",
      409
    );

    const created = await Student.createAccount({
      username,
      password: input.password,
      departmentName: input.departmentName,
      fullName,
      enrollmentNo,
      semester,
      email,
    });
    await this.log(
      "CREATE_USER",
      `Registered student ${created.username} (${created.departmentName})`
    );
    const student = (await this.getStudents()).find((row) => row.studentId === created.studentId);
    if (!student) throw new AppError("Could not create the student account.", 500);
    return {
      student,
      message: `Student ${created.username} created — they can sign in with the temporary password.`,
    };
  }

  /** Creates an additional administrator from inside the admin console. */
  async createAdminAccount(input: { username: string; password: string }): Promise<PublicUser> {
    const created = await Admin.createAccount(input);
    await this.log("CREATE_USER", `Created administrator account ${created.username}`);
    return created.toPublic();
  }

  toPublic(): PublicUser {
    return { ...super.toPublic(), adminId: this.adminId };
  }

  // ---------- Catalogue ----------

  async addNewBook(input: {
    title: string;
    author: string;
    deptId: number;
    replacementCost?: number;
    copies?: number;
  }): Promise<BookDTO> {
    const title = input.title.trim();
    const author = input.author.trim();
    assert(title.length >= 2, "Enter the book title.");
    assert(author.length >= 2, "Enter the author name.");
    const deptId = Number(input.deptId);
    const department = await Department.findById(deptId);
    assert(department, "Select a valid department.", 404);
    const copies = Number(input.copies ?? 1);
    assert(
      Number.isInteger(copies) && copies >= 1 && copies <= 99,
      "Copies must be a whole number between 1 and 99."
    );

    const duplicate = await one<{ book_id: number }>(
      "SELECT book_id FROM books WHERE title = ? COLLATE NOCASE AND author = ? COLLATE NOCASE AND dept_id = ?",
      title,
      author,
      deptId
    );
    assert(!duplicate, "This book already exists in that department.", 409);

    const replacementCost = Number(input.replacementCost ?? 500);
    const cost = Number.isFinite(replacementCost) && replacementCost > 0 ? replacementCost : 500;
    const result = await run(
      `INSERT INTO books
        (title, author, dept_id, availability_status, total_copies, available_copies, replacement_cost, created_at)
       VALUES (?, ?, ?, 'Available', ?, ?, ?, ?)`,
      title,
      author,
      deptId,
      copies,
      copies,
      cost,
      nowISO()
    );
    const book = await Book.findById(result.lastInsertRowid);
    if (!book) throw new AppError("Could not add the book.", 500);
    await this.log(
      "ADD_BOOK",
      `Added "${title}" (${copies} ${copies === 1 ? "copy" : "copies"}) to ${department!.deptName}`
    );
    return book.toDTO();
  }

  /** Updates every editable detail of an existing catalogue title. */
  async updateBookDetails(
    bookId: number,
    input: {
      title?: string;
      author?: string;
      isbn?: string;
      category?: string;
      deptId?: number;
      coverVariant?: number | null;
      replacementCost?: number;
      copies?: number;
    }
  ): Promise<BookDTO> {
    const book = await Book.findById(bookId);
    assert(book, "Book not found.", 404);

    const title = (input.title ?? book!.title).trim().replace(/\s+/g, " ");
    const author = (input.author ?? book!.author).trim().replace(/\s+/g, " ");
    const isbn = (input.isbn ?? book!.isbn).replace(/[\s-]/g, "");
    const category = (input.category ?? book!.category).trim().replace(/\s+/g, " ").slice(0, 40);
    const deptId = input.deptId !== undefined ? Number(input.deptId) : book!.deptId;
    const copies = input.copies !== undefined ? Number(input.copies) : book!.totalCopies;
    const coverVariant =
      input.coverVariant === undefined
        ? book!.coverVariant
        : input.coverVariant === null
          ? null
          : Number(input.coverVariant);
    const replacementCost =
      input.replacementCost !== undefined ? Number(input.replacementCost) : book!.replacementCost;

    assert(title.length >= 2 && title.length <= 140, "Title must be 2–140 characters.");
    assert(author.length >= 2 && author.length <= 100, "Author must be 2–100 characters.");
    assert(
      !isbn || /^(?:\d{9}[\dXx]|\d{13})$/.test(isbn),
      "ISBN must be 10 or 13 digits (hyphens and spaces are ignored)."
    );
    const department = await Department.findById(deptId);
    assert(department, "Select a valid department.", 404);
    assert(
      Number.isInteger(copies) && copies >= 1 && copies <= 99,
      "Copies must be a whole number between 1 and 99."
    );
    assert(
      coverVariant === null || (Number.isInteger(coverVariant) && coverVariant >= 0 && coverVariant <= 3),
      "Choose Auto or one of the four cover styles."
    );
    assert(
      Number.isFinite(replacementCost) && replacementCost > 0,
      "Replacement cost must be a positive amount."
    );

    const duplicate = await one<{ book_id: number }>(
      "SELECT book_id FROM books WHERE title = ? COLLATE NOCASE AND author = ? COLLATE NOCASE AND dept_id = ? AND book_id <> ?",
      title,
      author,
      deptId,
      bookId
    );
    assert(!duplicate, "Another book with this title and author already exists in that department.", 409);

    await book!.applyDetails({
      title,
      author,
      deptId,
      departmentName: department!.deptName,
      isbn,
      category,
      coverVariant,
      replacementCost,
      totalCopies: copies,
    });
    await this.log(
      "EDIT_BOOK",
      `Updated "${title}" — ${copies} ${copies === 1 ? "copy" : "copies"} in ${department!.deptName}`
    );
    const updated = await Book.findById(bookId);
    if (!updated) throw new AppError("Could not update the book.", 500);
    return updated.toDTO();
  }

  /** Removes a title only when no circulation record would be orphaned. */
  async deleteBook(bookId: number): Promise<{ message: string }> {
    const book = await Book.findById(bookId);
    assert(book, "Book not found.", 404);

    const history = await one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM transactions WHERE book_id = ?",
      bookId
    );
    assert(
      Number(history?.count ?? 0) === 0,
      "This title has loan history and cannot be deleted. Edit its copies instead so student and circulation records stay intact.",
      409
    );
    const activeHolds = await one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM reservations WHERE book_id = ? AND status IN ('Waiting', 'Ready')",
      bookId
    );
    assert(
      Number(activeHolds?.count ?? 0) === 0,
      "Students are waiting for this book. Resolve those reservations before deleting the title.",
      409
    );
    const pendingIssues = await IssueRequest.pendingForBook(bookId);
    assert(
      pendingIssues === 0,
      "Students have pending issue requests for this title. Approve or reject them before deleting it.",
      409
    );

    await run("DELETE FROM books WHERE book_id = ?", bookId);
    await this.log("DELETE_BOOK", `Removed "${book!.title}" from the catalogue`);
    return { message: `"${book!.title}" removed from the catalogue.` };
  }

  async addNewDepartment(deptName: string): Promise<DepartmentDTO> {
    const name = deptName.trim().replace(/\s+/g, " ");
    assert(name.length >= 2 && name.length <= 40, "Department name must be 2–40 characters.");
    assert(!(await Department.findByName(name)), "A department with that name already exists.", 409);

    const result = await run(
      "INSERT INTO departments (dept_name, created_at) VALUES (?, ?)",
      name,
      nowISO()
    );
    const department = await Department.findById(result.lastInsertRowid);
    if (!department) throw new AppError("Could not create the department.", 500);
    await this.log("ADD_DEPARTMENT", `Created department ${name}`);
    return department.toDTO();
  }

  // ---------- Policy ----------

  async customizeFinePolicy(input: Partial<SettingsDTO>): Promise<Settings> {
    assert(
      input.fineRate !== undefined || input.graceDays !== undefined ||
        input.lostPenalty !== undefined || input.maxUnpaidFine !== undefined,
      "Nothing to update."
    );
    const settings = await updateSettings({
      fineRate: input.fineRate,
      graceDays: input.graceDays,
      lostPenalty: input.lostPenalty,
      maxUnpaidFine: input.maxUnpaidFine,
    });
    await this.log(
      "UPDATE_POLICY",
      `Fine ₹${settings.fineRate}/day after ${settings.graceDays} grace days; lost penalty ₹${settings.lostPenalty}`
    );
    return settings;
  }

  async setMaxIssueLimit(limit: number): Promise<Settings> {
    const value = Number(limit);
    assert(Number.isInteger(value) && value >= 1 && value <= 20, "Issue limit must be between 1 and 20.");
    const settings = await updateSettings({ maxIssueLimit: value });
    await this.log("UPDATE_POLICY", `Maximum issue limit set to ${value} books`);
    return settings;
  }

  async setBorrowPeriod(days: number): Promise<Settings> {
    const value = Number(days);
    assert(Number.isInteger(value) && value >= 1 && value <= 90, "Loan period must be between 1 and 90 days.");
    const settings = await updateSettings({ borrowDays: value });
    await this.log("UPDATE_POLICY", `Standard loan period set to ${value} days`);
    return settings;
  }

  // ---------- Accounts ----------

  async getStudents(): Promise<AdminStudentDTO[]> {
    return (
      await all<{
        student_id: number;
        username: string;
        status: UserStatus;
        department_name: string;
        full_name: string;
        enrollment_no: string;
        semester: string;
        email: string;
        phone: string;
        fine_balance: number;
        created_at: string;
        active_loans: number;
        overdue_loans: number;
        fines_paid: number;
      }>(
        `SELECT s.student_id, u.username, u.status, s.department_name, s.fine_balance, u.created_at,
          s.full_name, s.enrollment_no, s.semester, s.email, s.phone,
          (SELECT COUNT(*) FROM transactions t WHERE t.student_id = s.student_id AND t.status = 'Issued') AS active_loans,
          (SELECT COUNT(*) FROM transactions t WHERE t.student_id = s.student_id AND t.status = 'Issued'
             AND t.due_date < ?) AS overdue_loans,
          (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
             WHERE p.student_id = s.student_id AND p.payment_status = 'Completed') AS fines_paid
         FROM students s JOIN users u ON u.id = s.student_id
         ORDER BY s.username COLLATE NOCASE`,
        todayISO()
      )
    ).map((row) => ({
      id: row.student_id,
      username: row.username,
      role: "Student",
      status: row.status,
      createdAt: row.created_at,
      studentId: row.student_id,
      departmentName: row.department_name,
      fullName: row.full_name ?? "",
      enrollmentNo: row.enrollment_no ?? "",
      semester: row.semester ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      fineBalance: Number(row.fine_balance),
      activeLoans: Number(row.active_loans),
      overdueLoans: Number(row.overdue_loans),
      totalFinesPaid: Number(row.fines_paid),
    }));
  }

  /** Updates a student's profile. The login username and all records stay untouched. */
  async updateStudentDetails(
    studentId: number,
    input: {
      fullName?: string;
      enrollmentNo?: string;
      departmentName?: string;
      semester?: string;
      email?: string;
      phone?: string;
      status?: UserStatus;
    }
  ): Promise<AdminStudentDTO> {
    const existing = (await this.getStudents()).find((row) => row.studentId === studentId);
    assert(existing, "Student not found.", 404);

    const fullName = (input.fullName ?? existing!.fullName).trim().replace(/\s+/g, " ");
    const enrollmentNo = (input.enrollmentNo ?? existing!.enrollmentNo).trim().toUpperCase();
    const departmentName = (input.departmentName ?? existing!.departmentName ?? "").trim();
    const semester = (input.semester ?? existing!.semester).trim().replace(/\s+/g, " ");
    const email = (input.email ?? existing!.email).trim();
    const phone = (input.phone ?? existing!.phone).replace(/[\s()-]/g, "");
    const status = input.status ?? existing!.status;

    assert(fullName.length >= 2 && fullName.length <= 80, "Full name must be 2–80 characters.");
    assert(
      !enrollmentNo || /^[A-Z0-9/-]{3,20}$/.test(enrollmentNo),
      "Enrollment number must be 3–20 characters (letters, numbers, / or -)."
    );
    const department = await Department.findByName(departmentName);
    assert(department, "Select a valid department.", 404);
    assert(semester.length <= 20, "Semester must be 20 characters or fewer.");
    assert(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Enter a valid email address.");
    assert(!phone || /^\d{7,15}$/.test(phone), "Phone number must be 7–15 digits.");
    assert(status === "Active" || status === "Suspended", "Status must be Active or Suspended.");

    await run(
      `UPDATE students
       SET full_name = ?, enrollment_no = ?, department_name = ?, semester = ?, email = ?, phone = ?
       WHERE student_id = ?`,
      fullName,
      enrollmentNo,
      department!.deptName,
      semester,
      email,
      phone,
      studentId
    );
    await run("UPDATE users SET status = ? WHERE id = ?", status, studentId);
    await this.log("EDIT_STUDENT", `Updated profile for ${existing!.username}`);

    const updated = (await this.getStudents()).find((row) => row.studentId === studentId);
    if (!updated) throw new AppError("Could not update the student.", 500);
    return updated;
  }

  async manageUserStatus(studentId: number, status: UserStatus): Promise<AdminStudentDTO> {
    assert(status === "Active" || status === "Suspended", "Status must be Active or Suspended.");
    const student = await one<{ student_id: number; username: string }>(
      "SELECT student_id, username FROM students WHERE student_id = ?",
      studentId
    );
    assert(student, "Student not found.", 404);

    await run("UPDATE users SET status = ? WHERE id = ?", status, studentId);
    const updated = (await this.getStudents()).find((row) => row.studentId === studentId);
    if (!updated) throw new AppError("Could not update the student.", 500);
    await this.log(
      "MANAGE_USER",
      `${status === "Active" ? "Activated" : "Suspended"} account ${student!.username}`
    );
    return updated;
  }

  async resetStudentAccount(studentId: number): Promise<{ message: string; student: AdminStudentDTO }> {
    const student = await one<{ student_id: number; username: string }>(
      "SELECT student_id, username FROM students WHERE student_id = ?",
      studentId
    );
    assert(student, "Student not found.", 404);

    const activeLoans = await Transaction.activeForStudent(studentId);
    for (const loan of activeLoans) {
      await loan.updateReturnRecord({ returnDate: todayISO(), fine: 0, status: "Returned" });
      const book = await Book.findById(loan.bookId);
      if (book) {
        await book.returnCopy();
        await Reservation.promoteNext(book.bookId);
      }
    }
    await run("UPDATE students SET fine_balance = 0 WHERE student_id = ?", studentId);
    await run("UPDATE users SET status = 'Active' WHERE id = ?", studentId);
    await this.log(
      "RESET_ACCOUNT",
      `Reset ${student!.username}: cleared fines, recalled ${activeLoans.length} loan(s), reactivated account`
    );

    const updated = (await this.getStudents()).find((row) => row.studentId === studentId);
    if (!updated) throw new AppError("Could not reset the account.", 500);
    return {
      message: `Account reset for ${student!.username}. All loans recalled and fines cleared.`,
      student: updated,
    };
  }

  // ---------- Issue requests ----------

  async getIssueRequests(): Promise<IssueRequestDTO[]> {
    return (await IssueRequest.all()).map((request) => request.toDTO());
  }

  /**
   * Approves a request by issuing a copy and writing the loan record, or rejects
   * it without touching stock. Only an Approve deducts an available copy.
   */
  async resolveIssueRequest(
    requestId: number,
    status: Exclude<IssueRequestStatus, "Pending">,
    note = ""
  ): Promise<IssueRequestDTO> {
    assert(status === "Approved" || status === "Rejected", "Status must be Approved or Rejected.");
    const request = await IssueRequest.findById(requestId);
    assert(request, "Issue request not found.", 404);
    assert(request!.status === "Pending", "This request has already been resolved.", 409);

    if (status === "Rejected") {
      await request!.markResolved("Rejected", note);
      await this.log(
        "REJECT_ISSUE",
        `Rejected the issue request for "${request!.title}" from ${request!.studentName}`
      );
      return (await IssueRequest.findById(requestId))!.toDTO();
    }

    const book = await Book.findById(request!.bookId);
    assert(book, "The requested book is no longer in the catalogue.", 404);
    assert(book!.availableCopies > 0, "No copies of this title are available right now.", 409);
    const account = await one<{ status: string }>(
      "SELECT status FROM users WHERE id = ?",
      request!.studentId
    );
    assert(account, "Student not found.", 404);
    assert(
      account!.status === "Active",
      "This student's account is suspended. Reactivate it before approving.",
      409
    );
    const active = await Transaction.activeForStudent(request!.studentId);
    assert(
      !active.some((loan) => loan.bookId === request!.bookId),
      "This student already has a copy of this title issued.",
      409
    );

    const settings = await getSettings();
    const transaction = await Transaction.createIssueRecord({
      studentId: request!.studentId,
      bookId: request!.bookId,
      borrowDays: settings.borrowDays,
    });
    await book!.checkoutCopy();
    await Reservation.fulfill(request!.bookId, request!.studentId);
    await request!.markResolved("Approved", note);
    await this.log(
      "APPROVE_ISSUE",
      `Approved "${book!.title}" for ${request!.studentName} (due ${formatDate(transaction.dueDate)})`
    );
    return (await IssueRequest.findById(requestId))!.toDTO();
  }

  // ---------- Requests ----------

  async getRequests(): Promise<RequestDTO[]> {
    return (
      await all<RequestRow>(
        `SELECT r.*, d.dept_name AS department_name, s.username AS student_name
         FROM book_requests r
         JOIN departments d ON d.dept_id = r.dept_id
         JOIN students s ON s.student_id = r.student_id
         ORDER BY CASE WHEN r.status = 'Pending' THEN 0 ELSE 1 END, r.created_at DESC`
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

  async resolveRequest(
    requestId: number,
    status: RequestStatus,
    note = "",
    copies = 1
  ): Promise<RequestDTO> {
    assert(status === "Approved" || status === "Rejected", "Request status must be Approved or Rejected.");
    const copyCount = Number(copies);
    if (status === "Approved") {
      assert(
        Number.isInteger(copyCount) && copyCount >= 1 && copyCount <= 99,
        "Copies must be a whole number between 1 and 99."
      );
    }
    const existing = await one<RequestRow>(
      `SELECT r.*, d.dept_name AS department_name, s.username AS student_name
       FROM book_requests r
       JOIN departments d ON d.dept_id = r.dept_id
       JOIN students s ON s.student_id = r.student_id
       WHERE r.request_id = ?`,
      requestId
    );
    assert(existing, "Request not found.", 404);

    await run(
      "UPDATE book_requests SET status = ?, review_note = ?, resolved_at = ? WHERE request_id = ?",
      status,
      note.trim().slice(0, 300),
      nowISO(),
      requestId
    );
    if (status === "Approved") {
      const duplicate = await one<{ book_id: number }>(
        "SELECT book_id FROM books WHERE title = ? COLLATE NOCASE AND dept_id = ?",
        existing!.title,
        existing!.dept_id
      );
      if (duplicate) {
        const book = await Book.findById(duplicate.book_id);
        await book?.addCopies(copyCount);
      } else {
        await run(
          `INSERT INTO books
            (title, author, dept_id, availability_status, total_copies, available_copies, replacement_cost, created_at)
           VALUES (?, ?, ?, 'Available', ?, ?, 500, ?)`,
          existing!.title,
          existing!.author,
          existing!.dept_id,
          copyCount,
          copyCount,
          nowISO()
        );
      }
    }
    await this.log(
      "RESOLVE_REQUEST",
      `${status} request for "${existing!.title}" from ${existing!.student_name}`
    );

    return (await this.getRequests()).find((request) => request.requestId === requestId)!;
  }

  // ---------- Announcements ----------

  async broadcastAnnouncement(message: string): Promise<AnnouncementDTO> {
    const text = message.trim();
    assert(text.length >= 5, "Announcement must be at least 5 characters.");
    const result = await run(
      "INSERT INTO announcements (message, author, created_at) VALUES (?, ?, ?)",
      text.slice(0, 1000),
      this.username,
      nowISO()
    );
    await this.log("ANNOUNCEMENT", "Published a library announcement");
    const row = await one<{ announcement_id: number; message: string; author: string; created_at: string }>(
      "SELECT * FROM announcements WHERE announcement_id = ?",
      result.lastInsertRowid
    );
    return {
      announcementId: Number(row?.announcement_id ?? 0),
      message: row?.message ?? text,
      author: row?.author ?? this.username,
      createdAt: row?.created_at ?? nowISO(),
    };
  }

  // ---------- Reporting & backup ----------

  async getCirculation(): Promise<LoanDTO[]> {
    return Promise.all((await Transaction.allActive()).map((loan) => loan.toDTO()));
  }

  async generateReport(): Promise<ReportDTO> {
    const bookTotals = await one<{
      books: number;
      available: number;
      issued: number;
      lost: number;
    }>(
      `SELECT COUNT(*) AS books,
        SUM(CASE WHEN availability_status = 'Available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN availability_status = 'Issued' THEN 1 ELSE 0 END) AS issued,
        SUM(CASE WHEN availability_status = 'Lost' THEN 1 ELSE 0 END) AS lost
       FROM books`
    );
    const students = await one<{ total: number; active: number }>(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active
       FROM users WHERE role = 'Student'`
    );
    const departments = await one<{ total: number }>("SELECT COUNT(*) AS total FROM departments");
    const circulation = await one<{ active: number; overdue: number }>(
      `SELECT COUNT(*) AS active,
        SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) AS overdue
       FROM transactions WHERE status = 'Issued'`,
      todayISO()
    );
    const money = await one<{ collected: number; outstanding: number }>(
      `SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_status = 'Completed') AS collected,
        (SELECT COALESCE(SUM(fine_balance), 0) FROM students) AS outstanding`
    );

    const allActive = await Transaction.allActive();
    const recentTransactions = await Promise.all(
      (await Transaction.recent(10)).map((loan) => loan.toDTO())
    );

    return {
      totals: {
        books: Number(bookTotals?.books ?? 0),
        availableBooks: Number(bookTotals?.available ?? 0),
        issuedBooks: Number(bookTotals?.issued ?? 0),
        lostBooks: Number(bookTotals?.lost ?? 0),
        departments: Number(departments?.total ?? 0),
        students: Number(students?.total ?? 0),
        activeStudents: Number(students?.active ?? 0),
        activeLoans: Number(circulation?.active ?? 0),
        overdueLoans: Number(circulation?.overdue ?? 0),
        finesCollected: Math.round(Number(money?.collected ?? 0) * 100) / 100,
        outstandingFines: Math.round(Number(money?.outstanding ?? 0) * 100) / 100,
      },
      departments: (
        await all<{ dept_id: number; dept_name: string; books: number; issued: number }>(
          `SELECT d.dept_id, d.dept_name,
            (SELECT COUNT(*) FROM books b WHERE b.dept_id = d.dept_id) AS books,
            (SELECT COUNT(*) FROM books b WHERE b.dept_id = d.dept_id AND b.availability_status = 'Issued') AS issued
           FROM departments d ORDER BY d.dept_name`
        )
      ).map((row) => ({
        deptId: row.dept_id,
        deptName: row.dept_name,
        books: Number(row.books),
        issued: Number(row.issued),
      })),
      topBooks: (
        await all<{ book_id: number; title: string; author: string; issue_count: number }>(
          `SELECT b.book_id, b.title, b.author, COUNT(t.transaction_id) AS issue_count
           FROM books b LEFT JOIN transactions t ON t.book_id = b.book_id
           GROUP BY b.book_id ORDER BY issue_count DESC, b.title LIMIT 5`
        )
      ).map((row) => ({
        bookId: row.book_id,
        title: row.title,
        author: row.author,
        issueCount: Number(row.issue_count),
      })),
      recentTransactions,
      overdue: await Promise.all(
        allActive.filter((loan) => loan.isOverdue()).map((loan) => loan.toDTO())
      ),
    };
  }

  async backupDatabase(): Promise<{ generatedAt: string; tables: Record<string, unknown[]> }> {
    const tables: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      tables[table] = await all(`SELECT * FROM ${table}`);
    }
    await this.log("BACKUP", "Downloaded a full database backup");
    return { generatedAt: nowISO(), tables };
  }
}
