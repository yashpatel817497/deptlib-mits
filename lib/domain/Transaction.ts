import { all, one, run } from "../db";
import { daysBetween, nowISO, todayISO } from "../dates";
import { AppError } from "../errors";
import { getSettings } from "../settings";
import type { LoanDTO, LoanStatus } from "../types";

interface TransactionRow {
  transaction_id: number;
  student_id: number;
  book_id: number;
  issue_date: string;
  due_date: string;
  return_date: string | null;
  fine_calculated: number;
  renewal_count: number;
  status: LoanStatus;
  created_at: string;
  title: string;
  author: string;
  department_name: string;
  student_name: string;
}

const BASE_SELECT = `
  SELECT t.*, b.title, b.author, d.dept_name AS department_name, s.username AS student_name
  FROM transactions t
  JOIN books b ON b.book_id = t.book_id
  JOIN departments d ON d.dept_id = b.dept_id
  JOIN students s ON s.student_id = t.student_id
`;

/** Links a student to a book for one circulation lifecycle. */
export class Transaction {
  transactionId: number;
  studentId: number;
  bookId: number;
  issueDate: string;
  dueDate: string;
  returnDate: string | null;
  fineCalculated: number;
  renewalCount: number;
  status: LoanStatus;
  createdAt: string;
  title: string;
  author: string;
  departmentName: string;
  studentName: string;

  constructor(row: TransactionRow) {
    this.transactionId = row.transaction_id;
    this.studentId = row.student_id;
    this.bookId = row.book_id;
    this.issueDate = row.issue_date;
    this.dueDate = row.due_date;
    this.returnDate = row.return_date;
    this.fineCalculated = Number(row.fine_calculated);
    this.renewalCount = Number(row.renewal_count);
    this.status = row.status;
    this.createdAt = row.created_at;
    this.title = row.title;
    this.author = row.author;
    this.departmentName = row.department_name;
    this.studentName = row.student_name;
  }

  static async findById(transactionId: number): Promise<Transaction | null> {
    const row = await one<TransactionRow>(
      `${BASE_SELECT} WHERE t.transaction_id = ?`,
      transactionId
    );
    return row ? new Transaction(row) : null;
  }

  static async forStudent(studentId: number): Promise<Transaction[]> {
    return (
      await all<TransactionRow>(
        `${BASE_SELECT} WHERE t.student_id = ? ORDER BY t.created_at DESC`,
        studentId
      )
    ).map((row) => new Transaction(row));
  }

  static async activeForStudent(studentId: number): Promise<Transaction[]> {
    return (
      await all<TransactionRow>(
        `${BASE_SELECT} WHERE t.student_id = ? AND t.status = 'Issued' ORDER BY t.due_date`,
        studentId
      )
    ).map((row) => new Transaction(row));
  }

  static async allActive(): Promise<Transaction[]> {
    return (
      await all<TransactionRow>(
        `${BASE_SELECT} WHERE t.status = 'Issued' ORDER BY t.issue_date`
      )
    ).map((row) => new Transaction(row));
  }

  static async recent(limit = 50): Promise<Transaction[]> {
    return (
      await all<TransactionRow>(
        `${BASE_SELECT} ORDER BY t.created_at DESC LIMIT ?`,
        limit
      )
    ).map((row) => new Transaction(row));
  }

  static async createIssueRecord(input: {
    studentId: number;
    bookId: number;
    borrowDays: number;
    issueDate?: string;
  }): Promise<Transaction> {
    const issueDate = input.issueDate ?? todayISO();
    const dueDate = new Date(`${issueDate}T00:00:00.000Z`);
    dueDate.setUTCDate(dueDate.getUTCDate() + input.borrowDays);
    const due = dueDate.toISOString().slice(0, 10);

    const result = await run(
      `INSERT INTO transactions
        (student_id, book_id, issue_date, due_date, return_date, fine_calculated, renewal_count, status, created_at)
       VALUES (?, ?, ?, ?, NULL, 0, 0, 'Issued', ?)`,
      input.studentId,
      input.bookId,
      issueDate,
      due,
      nowISO()
    );
    const created = await Transaction.findById(result.lastInsertRowid);
    if (!created) throw new AppError("Could not create the issue record.", 500);
    return created;
  }

  /** Overdue days beyond the configured grace period, multiplied by the daily rate. */
  async calculateFine(returnDate: string = todayISO()): Promise<number> {
    const { fineRate, graceDays } = await getSettings();
    const daysLate = Math.max(0, daysBetween(this.dueDate, returnDate) - graceDays);
    return Math.round(daysLate * fineRate * 100) / 100;
  }

  isOverdue(reference: string = todayISO()): boolean {
    return this.status === "Issued" && daysBetween(this.dueDate, reference) > 0;
  }

  async updateReturnRecord(input: {
    returnDate?: string;
    fine?: number;
    status?: LoanStatus;
  }): Promise<void> {
    const returnDate = input.returnDate ?? todayISO();
    const fine = input.fine ?? 0;
    const status = input.status ?? "Returned";
    await run(
      `UPDATE transactions
       SET return_date = ?, fine_calculated = ?, status = ?
       WHERE transaction_id = ?`,
      returnDate,
      fine,
      status,
      this.transactionId
    );
    this.returnDate = returnDate;
    this.fineCalculated = fine;
    this.status = status;
  }

  async markRenewed(newDueDate: string): Promise<void> {
    await run(
      "UPDATE transactions SET due_date = ?, renewal_count = renewal_count + 1 WHERE transaction_id = ?",
      newDueDate,
      this.transactionId
    );
    this.dueDate = newDueDate;
    this.renewalCount += 1;
  }

  getDaysOverdue(reference: string = todayISO()): number {
    if (this.status !== "Issued") return 0;
    return Math.max(0, daysBetween(this.dueDate, reference));
  }

  async toDTO(): Promise<LoanDTO> {
    return {
      transactionId: this.transactionId,
      bookId: this.bookId,
      studentId: this.studentId,
      studentName: this.studentName,
      title: this.title,
      author: this.author,
      departmentName: this.departmentName,
      issueDate: this.issueDate,
      dueDate: this.dueDate,
      returnDate: this.returnDate,
      fineCalculated: this.fineCalculated,
      renewalCount: this.renewalCount,
      status: this.status,
      daysOverdue: this.getDaysOverdue(),
      fineIfReturnedToday:
        this.status === "Issued" ? await this.calculateFine() : this.fineCalculated,
    };
  }
}
