import { all, one } from "../db";
import { AppError } from "../errors";
import type { DepartmentDTO } from "../types";
import { Book } from "./Book";

interface DepartmentRow {
  dept_id: number;
  dept_name: string;
  created_at: string;
  book_count?: number;
  issued_count?: number;
}

/** A department aggregates books (1-to-many). */
export class Department {
  deptId: number;
  deptName: string;
  createdAt: string;
  private bookCount: number;
  private issuedCount: number;

  constructor(row: DepartmentRow) {
    this.deptId = row.dept_id;
    this.deptName = row.dept_name;
    this.createdAt = row.created_at;
    this.bookCount = Number(row.book_count ?? 0);
    this.issuedCount = Number(row.issued_count ?? 0);
  }

  static async list(): Promise<Department[]> {
    return (
      await all<DepartmentRow>(
        `SELECT d.*,
          (SELECT COUNT(*) FROM books b WHERE b.dept_id = d.dept_id) AS book_count,
          (SELECT COUNT(*) FROM books b WHERE b.dept_id = d.dept_id AND b.availability_status = 'Issued') AS issued_count
         FROM departments d
         ORDER BY d.dept_name COLLATE NOCASE`
      )
    ).map((row) => new Department(row));
  }

  static async findById(deptId: number): Promise<Department | null> {
    const row = await one<DepartmentRow>(
      `SELECT d.*,
        (SELECT COUNT(*) FROM books b WHERE b.dept_id = d.dept_id) AS book_count,
        (SELECT COUNT(*) FROM books b WHERE b.dept_id = d.dept_id AND b.availability_status = 'Issued') AS issued_count
       FROM departments d WHERE d.dept_id = ?`,
      deptId
    );
    return row ? new Department(row) : null;
  }

  static async findByName(deptName: string): Promise<Department | null> {
    const row = await one<DepartmentRow>(
      "SELECT * FROM departments WHERE dept_name = ?",
      deptName.trim()
    );
    return row ? new Department(row) : null;
  }

  async getBookList(): Promise<ReturnType<Book["toDTO"]>[]> {
    return (await Book.search({ deptId: this.deptId })).map((book) => book.toDTO());
  }

  toDTO(): DepartmentDTO {
    return {
      deptId: this.deptId,
      deptName: this.deptName,
      bookCount: this.bookCount,
      issuedCount: this.issuedCount,
      createdAt: this.createdAt,
    };
  }

  static async assertExists(deptId: number): Promise<Department> {
    const dept = await Department.findById(deptId);
    if (!dept) throw new AppError("Department not found.", 404);
    return dept;
  }
}
