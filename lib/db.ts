import { createClient, type Client, type InValue } from "@libsql/client";
import { nowISO } from "./dates";

const globalForDb = globalThis as unknown as {
  __dlmsDb?: Promise<Client>;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Admin', 'Student')),
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    admin_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS students (
    student_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    enrollment_no TEXT NOT NULL DEFAULT '',
    semester TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    department_name TEXT NOT NULL,
    fine_balance REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS departments (
    dept_id INTEGER PRIMARY KEY AUTOINCREMENT,
    dept_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS books (
    book_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    isbn TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    cover_variant INTEGER,
    dept_id INTEGER NOT NULL REFERENCES departments(dept_id),
    availability_status TEXT NOT NULL DEFAULT 'Available'
      CHECK (availability_status IN ('Available', 'Issued', 'Lost')),
    total_copies INTEGER NOT NULL DEFAULT 1,
    available_copies INTEGER NOT NULL DEFAULT 1,
    replacement_cost REAL NOT NULL DEFAULT 500,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reservations (
    reservation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Waiting'
      CHECK (status IN ('Waiting', 'Ready', 'Fulfilled', 'Cancelled')),
    created_at TEXT NOT NULL,
    notified_at TEXT
  );

  CREATE TABLE IF NOT EXISTS book_reviews (
    review_id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (book_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(student_id),
    book_id INTEGER NOT NULL REFERENCES books(book_id),
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    return_date TEXT,
    fine_calculated REAL NOT NULL DEFAULT 0,
    renewal_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Issued'
      CHECK (status IN ('Issued', 'Returned', 'Lost')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    payment_reference_id TEXT PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(student_id),
    amount REAL NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'Pending'
      CHECK (payment_status IN ('Pending', 'Completed', 'Failed')),
    method TEXT NOT NULL DEFAULT 'UPI',
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS announcements (
    announcement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS issue_requests (
    request_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Pending'
      CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    review_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS book_requests (
    request_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    dept_id INTEGER NOT NULL REFERENCES departments(dept_id),
    status TEXT NOT NULL DEFAULT 'Pending'
      CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    review_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_student ON transactions(student_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_book ON transactions(book_id);
  CREATE INDEX IF NOT EXISTS idx_books_dept ON books(dept_id);
  CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_reservations_book ON reservations(book_id, status);
  CREATE INDEX IF NOT EXISTS idx_reservations_student ON reservations(student_id, status);
  CREATE INDEX IF NOT EXISTS idx_issue_requests_status ON issue_requests(status, created_at);
`;

const COLUMN_MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "books", column: "isbn", ddl: "ALTER TABLE books ADD COLUMN isbn TEXT NOT NULL DEFAULT ''" },
  { table: "books", column: "category", ddl: "ALTER TABLE books ADD COLUMN category TEXT NOT NULL DEFAULT ''" },
  { table: "books", column: "cover_variant", ddl: "ALTER TABLE books ADD COLUMN cover_variant INTEGER" },
  { table: "students", column: "full_name", ddl: "ALTER TABLE students ADD COLUMN full_name TEXT NOT NULL DEFAULT ''" },
  { table: "students", column: "enrollment_no", ddl: "ALTER TABLE students ADD COLUMN enrollment_no TEXT NOT NULL DEFAULT ''" },
  { table: "students", column: "semester", ddl: "ALTER TABLE students ADD COLUMN semester TEXT NOT NULL DEFAULT ''" },
  { table: "students", column: "email", ddl: "ALTER TABLE students ADD COLUMN email TEXT NOT NULL DEFAULT ''" },
  { table: "students", column: "phone", ddl: "ALTER TABLE students ADD COLUMN phone TEXT NOT NULL DEFAULT ''" },
];

async function migrate(db: Client): Promise<void> {
  for (const table of ["books", "students"]) {
    const info = await db.execute(`PRAGMA table_info(${table})`);
    const present = new Set(info.rows.map((row) => String(row.name)));
    for (const migration of COLUMN_MIGRATIONS.filter((entry) => entry.table === table)) {
      if (present.has(migration.column)) continue;
      try {
        await db.execute(migration.ddl);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/duplicate column name/i.test(message)) throw error;
      }
    }
  }
}

function database(): Promise<Client> {
  if (!globalForDb.__dlmsDb) {
    globalForDb.__dlmsDb = connect().catch((error) => {
      globalForDb.__dlmsDb = undefined;
      throw error;
    });
  }
  return globalForDb.__dlmsDb;
}

async function connect(): Promise<Client> {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not configured in Environment Variables.");
  }

  const db = createClient({ url, authToken });

  for (const statement of SCHEMA.split(";").map((part) => part.trim()).filter(Boolean)) {
    await db.execute(statement);
  }
  await migrate(db);
  await seed(db);
  return db;
}

function toArgs(params: unknown[]): InValue[] {
  return params.map((p) => (p === undefined ? null : (p as InValue)));
}

export async function all<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const db = await database();
  const result = await db.execute({ sql, args: toArgs(params) });
  return result.rows as unknown as T[];
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  const rows = await all<T>(sql, ...params);
  return rows[0];
}

export async function run(
  sql: string,
  ...params: unknown[]
): Promise<{ changes: number; lastInsertRowid: number }> {
  const db = await database();
  const result = await db.execute({ sql, args: toArgs(params) });
  return {
    changes: Number(result.rowsAffected ?? 0),
    lastInsertRowid: Number(result.lastInsertRowid ?? 0),
  };
}

const DEFAULT_SETTINGS: Record<string, string> = {
  fine_rate: "5",
  grace_days: "2",
  max_issue_limit: "3",
  borrow_days: "14",
  lost_penalty: "500",
  max_unpaid_fine: "100",
};

async function seed(db: Client): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
      args: [key, value],
    });
  }

  const existing = await db.execute("SELECT COUNT(*) AS count FROM departments");
  const count = Number(existing.rows[0]?.count ?? 0);
  if (count > 0) return;

  const now = nowISO();
  const deptIds: Record<string, number> = {};

  for (const name of ["AIML", "Computer Science", "Electronics", "Mechanical"]) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO departments (dept_name, created_at) VALUES (?, ?)",
      args: [name, now],
    });
    const row = await db.execute({
      sql: "SELECT dept_id FROM departments WHERE dept_name = ?",
      args: [name],
    });
    if (row.rows[0]) {
      deptIds[name] = Number(row.rows[0].dept_id);
    }
  }

  const books: Array<[string, string, string]> = [
    ["Artificial Intelligence: A Modern Approach", "Stuart Russell & Peter Norvig", "AIML"],
    ["Deep Learning", "Ian Goodfellow", "AIML"],
    ["Pattern Recognition and Machine Learning", "Christopher Bishop", "AIML"],
    ["Introduction to Algorithms", "Thomas H. Cormen", "Computer Science"],
    ["Clean Code", "Robert C. Martin", "Computer Science"],
    ["Database System Concepts", "Abraham Silberschatz", "Computer Science"],
    ["Computer Networks", "Andrew S. Tanenbaum", "Computer Science"],
    ["Microelectronic Circuits", "Adel S. Sedra", "Electronics"],
    ["Signals and Systems", "Alan V. Oppenheim", "Electronics"],
    ["Digital Design", "M. Morris Mano", "Electronics"],
    ["Fundamentals of Engineering Thermodynamics", "Michael J. Moran", "Mechanical"],
    ["Shigley's Mechanical Engineering Design", "Richard G. Budynas", "Mechanical"],
  ];

  for (const [title, author, dept] of books) {
    await db.execute({
      sql: `INSERT INTO books (title, author, dept_id, availability_status, replacement_cost, created_at)
            SELECT ?, ?, ?, 'Available', 500, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM books WHERE title = ? COLLATE NOCASE AND dept_id = ?
            )`,
      args: [title, author, deptIds[dept], now, title, deptIds[dept]],
    });
  }

  await db.execute({
    sql: `INSERT INTO announcements (message, author, created_at)
          SELECT ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE author = 'Library')`,
    args: [
      "Welcome to the department library portal. Borrow up to 3 books for 14 days. Fines are ₹5 per day after a 2-day grace period.",
      "Library",
      now,
    ],
  });
}
