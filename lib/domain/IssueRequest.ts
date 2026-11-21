import { all, one, run } from "../db";
import { nowISO } from "../dates";
import { AppError, assert } from "../errors";
import type { IssueRequestDTO, IssueRequestStatus } from "../types";

interface IssueRequestRow {
  request_id: number;
  student_id: number;
  book_id: number;
  status: IssueRequestStatus;
  review_note: string;
  created_at: string;
  resolved_at: string | null;
  title: string;
  author: string;
  available_copies: number;
  book_department: string;
  student_name: string;
  full_name: string;
  enrollment_no: string;
  semester: string;
  department_name: string;
}

const BASE_SELECT = `
  SELECT r.*, b.title, b.author, b.available_copies,
    bd.dept_name AS book_department,
    u.username AS student_name,
    s.full_name, s.enrollment_no, s.semester, s.department_name
  FROM issue_requests r
  JOIN books b ON b.book_id = r.book_id
  JOIN departments bd ON bd.dept_id = b.dept_id
  JOIN students s ON s.student_id = r.student_id
  JOIN users u ON u.id = s.student_id
`;

/**
 * A student's self-service request to borrow a title. Nothing is deducted from
 * the shelf until a librarian approves it; the request row is kept afterwards
 * so the approval trail stays auditable.
 */
export class IssueRequest {
  requestId: number;
  studentId: number;
  bookId: number;
  status: IssueRequestStatus;
  reviewNote: string;
  createdAt: string;
  resolvedAt: string | null;
  title: string;
  author: string;
  availableCopies: number;
  bookDepartment: string;
  studentName: string;
  fullName: string;
  enrollmentNo: string;
  semester: string;
  departmentName: string;

  constructor(row: IssueRequestRow) {
    this.requestId = row.request_id;
    this.studentId = row.student_id;
    this.bookId = row.book_id;
    this.status = row.status;
    this.reviewNote = row.review_note;
    this.createdAt = row.created_at;
    this.resolvedAt = row.resolved_at;
    this.title = row.title;
    this.author = row.author;
    this.availableCopies = Number(row.available_copies ?? 0);
    this.bookDepartment = row.book_department;
    this.studentName = row.student_name;
    this.fullName = row.full_name ?? "";
    this.enrollmentNo = row.enrollment_no ?? "";
    this.semester = row.semester ?? "";
    this.departmentName = row.department_name ?? "";
  }

  static async findById(requestId: number): Promise<IssueRequest | null> {
    const row = await one<IssueRequestRow>(
      `${BASE_SELECT} WHERE r.request_id = ?`,
      requestId
    );
    return row ? new IssueRequest(row) : null;
  }

  static async all(): Promise<IssueRequest[]> {
    return (
      await all<IssueRequestRow>(
        `${BASE_SELECT}
         ORDER BY CASE WHEN r.status = 'Pending' THEN 0 ELSE 1 END,
                  r.created_at DESC, r.request_id DESC`
      )
    ).map((row) => new IssueRequest(row));
  }

  static async forStudent(studentId: number): Promise<IssueRequest[]> {
    return (
      await all<IssueRequestRow>(
        `${BASE_SELECT} WHERE r.student_id = ? ORDER BY r.created_at DESC, r.request_id DESC`,
        studentId
      )
    ).map((row) => new IssueRequest(row));
  }

  static async pendingForBook(bookId: number): Promise<number> {
    return Number(
      (
        await one<{ count: number }>(
          "SELECT COUNT(*) AS count FROM issue_requests WHERE book_id = ? AND status = 'Pending'",
          bookId
        )
      )?.count ?? 0
    );
  }

  static async pendingCount(): Promise<number> {
    return Number(
      (
        await one<{ count: number }>(
          "SELECT COUNT(*) AS count FROM issue_requests WHERE status = 'Pending'"
        )
      )?.count ?? 0
    );
  }

  /** Creates a Pending request, refusing duplicates while one is in flight. */
  static async create(studentId: number, bookId: number): Promise<IssueRequest> {
    const duplicate = await one<{ request_id: number }>(
      "SELECT request_id FROM issue_requests WHERE student_id = ? AND book_id = ? AND status = 'Pending'",
      studentId,
      bookId
    );
    assert(
      !duplicate,
      "You already have a pending request for this book. Please wait for the librarian.",
      409
    );

    const result = await run(
      `INSERT INTO issue_requests (student_id, book_id, status, review_note, created_at, resolved_at)
       VALUES (?, ?, 'Pending', '', ?, NULL)`,
      studentId,
      bookId,
      nowISO()
    );
    const created = await IssueRequest.findById(result.lastInsertRowid);
    if (!created) throw new AppError("Could not save the issue request.", 500);
    return created;
  }

  async markResolved(status: IssueRequestStatus, note = ""): Promise<void> {
    await run(
      "UPDATE issue_requests SET status = ?, review_note = ?, resolved_at = ? WHERE request_id = ?",
      status,
      note.trim().slice(0, 300),
      nowISO(),
      this.requestId
    );
    this.status = status;
    this.reviewNote = note.trim().slice(0, 300);
    this.resolvedAt = nowISO();
  }

  toDTO(): IssueRequestDTO {
    return {
      requestId: this.requestId,
      studentId: this.studentId,
      studentName: this.studentName,
      fullName: this.fullName,
      enrollmentNo: this.enrollmentNo,
      departmentName: this.departmentName,
      semester: this.semester,
      bookId: this.bookId,
      title: this.title,
      author: this.author,
      bookDepartment: this.bookDepartment,
      availableCopies: this.availableCopies,
      status: this.status,
      reviewNote: this.reviewNote,
      createdAt: this.createdAt,
      resolvedAt: this.resolvedAt,
    };
  }
}
