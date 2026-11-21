import { all, one, run } from "../db";
import { AppError } from "../errors";
import type { BookDTO, ReviewDTO } from "../types";
import type { Availability } from "../types";

interface BookRow {
  book_id: number;
  title: string;
  author: string;
  isbn?: string | null;
  category?: string | null;
  cover_variant?: number | null;
  dept_id: number;
  department_name?: string;
  availability_status: Availability;
  total_copies: number;
  available_copies: number;
  replacement_cost: number;
  review_count?: number;
  average_rating?: number | null;
  issue_count?: number;
  created_at: string;
}

const BASE_SELECT = `
  SELECT b.*, d.dept_name AS department_name,
    (SELECT COUNT(*) FROM book_reviews r WHERE r.book_id = b.book_id) AS review_count,
    (SELECT AVG(r.rating) FROM book_reviews r WHERE r.book_id = b.book_id) AS average_rating,
    (SELECT COUNT(*) FROM transactions t WHERE t.book_id = b.book_id) AS issue_count
  FROM books b
  JOIN departments d ON d.dept_id = b.dept_id
`;

export interface BookSearchFilters {
  q?: string;
  deptId?: number | null;
  status?: Availability | null;
}

/** A book that always belongs to exactly one department. */
export class Book {
  bookId: number;
  title: string;
  author: string;
  isbn: string;
  category: string;
  coverVariant: number | null;
  deptId: number;
  departmentName: string;
  availabilityStatus: Availability;
  totalCopies: number;
  availableCopies: number;
  replacementCost: number;
  averageRating: number | null;
  reviewCount: number;
  issueCount: number;
  createdAt: string;

  constructor(row: BookRow) {
    this.bookId = row.book_id;
    this.title = row.title;
    this.author = row.author;
    this.isbn = row.isbn ?? "";
    this.category = row.category ?? "";
    this.coverVariant =
      row.cover_variant === null || row.cover_variant === undefined
        ? null
        : Number(row.cover_variant);
    this.deptId = row.dept_id;
    this.departmentName = row.department_name ?? "";
    this.availabilityStatus = row.availability_status;
    this.totalCopies = Number(row.total_copies ?? 1);
    this.availableCopies = Number(row.available_copies ?? 1);
    this.replacementCost = Number(row.replacement_cost);
    this.averageRating =
      row.average_rating === null || row.average_rating === undefined
        ? null
        : Math.round(Number(row.average_rating) * 10) / 10;
    this.reviewCount = Number(row.review_count ?? 0);
    this.issueCount = Number(row.issue_count ?? 0);
    this.createdAt = row.created_at;
  }

  static fromRow(row: BookRow | undefined): Book | null {
    return row ? new Book(row) : null;
  }

  static async findById(bookId: number): Promise<Book | null> {
    return Book.fromRow(await one<BookRow>(`${BASE_SELECT} WHERE b.book_id = ?`, bookId));
  }

  static async search(filters: BookSearchFilters = {}): Promise<Book[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    const q = filters.q?.trim();
    if (q) {
      clauses.push(
        "(b.title LIKE ? OR b.author LIKE ? OR d.dept_name LIKE ? OR CAST(b.book_id AS TEXT) = ?)"
      );
      const like = `%${q}%`;
      params.push(like, like, like, q);
    }
    if (filters.deptId) {
      clauses.push("b.dept_id = ?");
      params.push(filters.deptId);
    }
    if (filters.status) {
      clauses.push("b.availability_status = ?");
      params.push(filters.status);
    }

    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return (
      await all<BookRow>(`${BASE_SELECT}${where} ORDER BY b.title COLLATE NOCASE`, ...params)
    ).map((row) => new Book(row));
  }

  async getDetails(): Promise<BookDTO & { reviews: ReviewDTO[] }> {
    const reviews = (
      await all<{
        review_id: number;
        book_id: number;
        student_id: number;
        student_name: string;
        rating: number;
        comment: string;
        created_at: string;
      }>(
        `SELECT r.*, s.username AS student_name
         FROM book_reviews r
         JOIN students s ON s.student_id = r.student_id
         WHERE r.book_id = ?
         ORDER BY r.created_at DESC`,
        this.bookId
      )
    ).map((row) => ({
      reviewId: row.review_id,
      bookId: row.book_id,
      studentId: row.student_id,
      studentName: row.student_name,
      rating: Number(row.rating),
      comment: row.comment,
      createdAt: row.created_at,
    }));

    return { ...this.toDTO(), reviews };
  }

  get hasAvailableCopy(): boolean {
    return this.availableCopies > 0 && this.availabilityStatus !== "Lost";
  }

  async updateStatus(status: Availability): Promise<void> {
    if (!["Available", "Issued", "Lost"].includes(status)) {
      throw new AppError("Unknown availability status.");
    }
    const result = await one<{ book_id: number }>(
      "UPDATE books SET availability_status = ? WHERE book_id = ? RETURNING book_id",
      status,
      this.bookId
    );
    if (!result) throw new AppError("Book not found.", 404);
    this.availabilityStatus = status;
  }

  /** Persists a new copy count and keeps the status derived from availability. */
  async setCopies(totalCopies: number, availableCopies: number): Promise<void> {
    const total = Math.max(0, Math.trunc(totalCopies));
    const available = Math.max(0, Math.min(total, Math.trunc(availableCopies)));
    const status: Availability =
      total === 0 ? "Lost" : available > 0 ? "Available" : "Issued";
    await run(
      "UPDATE books SET total_copies = ?, available_copies = ?, availability_status = ? WHERE book_id = ?",
      total,
      available,
      status,
      this.bookId
    );
    this.totalCopies = total;
    this.availableCopies = available;
    this.availabilityStatus = status;
  }

  /** Removes one copy from the shelf when it is issued. */
  async checkoutCopy(): Promise<void> {
    if (this.availableCopies <= 0) {
      throw new AppError("No copies of this book are available right now.", 409);
    }
    await this.setCopies(this.totalCopies, this.availableCopies - 1);
  }

  /** Puts a returned copy back on the shelf. */
  async returnCopy(): Promise<void> {
    await this.setCopies(this.totalCopies, this.availableCopies + 1);
  }

  /** A lost copy is written off; the title is only marked Lost when no copies remain. */
  async recordLostCopy(): Promise<void> {
    const total = Math.max(0, this.totalCopies - 1);
    await this.setCopies(total, Math.min(this.availableCopies, total));
  }

  /** Adds copies to an existing title (used when approving a duplicate request). */
  async addCopies(copies: number): Promise<void> {
    await this.setCopies(this.totalCopies + copies, this.availableCopies + copies);
  }

  /** How many copies are out with students right now. */
  get issuedCopies(): number {
    return Math.max(0, this.totalCopies - this.availableCopies);
  }

  /**
   * Rewrites every editable detail of the title. Stock can never be set below
   * the copies already on loan, so circulation records stay coherent.
   */
  async applyDetails(input: {
    title: string;
    author: string;
    deptId: number;
    departmentName: string;
    isbn: string;
    category: string;
    coverVariant: number | null;
    replacementCost: number;
    totalCopies: number;
  }): Promise<void> {
    const total = Math.max(0, Math.trunc(input.totalCopies));
    if (total < this.issuedCopies) {
      throw new AppError(
        `${this.issuedCopies} ${this.issuedCopies === 1 ? "copy is" : "copies are"} currently issued. Stock must stay at ${this.issuedCopies} or more.`,
        409
      );
    }
    const available = total - this.issuedCopies;
    const status: Availability =
      total === 0 ? "Lost" : available > 0 ? "Available" : "Issued";
    await run(
      `UPDATE books
       SET title = ?, author = ?, dept_id = ?, isbn = ?, category = ?, cover_variant = ?,
           replacement_cost = ?, total_copies = ?, available_copies = ?, availability_status = ?
       WHERE book_id = ?`,
      input.title,
      input.author,
      input.deptId,
      input.isbn,
      input.category,
      input.coverVariant,
      input.replacementCost,
      total,
      available,
      status,
      this.bookId
    );
    this.title = input.title;
    this.author = input.author;
    this.deptId = input.deptId;
    this.departmentName = input.departmentName;
    this.isbn = input.isbn;
    this.category = input.category;
    this.coverVariant = input.coverVariant;
    this.replacementCost = input.replacementCost;
    this.totalCopies = total;
    this.availableCopies = available;
    this.availabilityStatus = status;
  }

  toDTO(): BookDTO {
    return {
      bookId: this.bookId,
      title: this.title,
      author: this.author,
      isbn: this.isbn,
      category: this.category,
      coverVariant: this.coverVariant,
      deptId: this.deptId,
      departmentName: this.departmentName,
      availabilityStatus: this.availabilityStatus,
      totalCopies: this.totalCopies,
      availableCopies: this.availableCopies,
      replacementCost: this.replacementCost,
      averageRating: this.averageRating,
      reviewCount: this.reviewCount,
      issueCount: this.issueCount,
      createdAt: this.createdAt,
    };
  }
}
