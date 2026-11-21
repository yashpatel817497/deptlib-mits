import { getCloudflareContext } from "@opennextjs/cloudflare";
import { nowISO } from "./dates";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number; last_row_id?: number } }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<unknown>;
}

const globalForDb = globalThis as unknown as {
  __dlmsDb?: Promise<D1Database>;
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

/**
 * Additive column migrations so databases created before a field existed keep
 * every row they already hold. New columns only — nothing is dropped or rebuilt.
 */
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

async function migrate(db: D1Database): Promise<void> {
  for (const table of ["books", "students"]) {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const present = new Set((info.results ?? []).map((row) => String(row.name)));
    for (const migration of COLUMN_MIGRATIONS.filter((entry) => entry.table === table)) {
      if (present.has(migration.column)) continue;
      try {
        await db.prepare(migration.ddl).run();
      } catch (error) {
        // Two isolates can race the same additive migration; a duplicate column is safe.
        const message = error instanceof Error ? error.message : String(error);
        if (!/duplicate column name/i.test(message)) throw error;
      }
    }
  }
}

function database(): Promise<D1Database> {
  if (!globalForDb.__dlmsDb) {
    globalForDb.__dlmsDb = connect().catch((error) => {
      globalForDb.__dlmsDb = undefined;
      throw error;
    });
  }
  return globalForDb.__dlmsDb;
}

async function connect(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) {
    throw new Error("The D1 database binding `DB` is not configured.");
  }
  for (const statement of SCHEMA.split(";").map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
  await migrate(db);
  await seed(db);
  return db;
}

export async function all<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const db = await database();
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results ?? [];
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  const db = await database();
  const result = await db.prepare(sql).bind(...params).first<T>();
  return result ?? undefined;
}

export async function run(
  sql: string,
  ...params: unknown[]
): Promise<{ changes: number; lastInsertRowid: number }> {
  const db = await database();
  const result = await db.prepare(sql).bind(...params).run();
  return {
    changes: Number(result.meta?.changes ?? 0),
    lastInsertRowid: Number(result.meta?.last_row_id ?? 0),
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

async function seed(db: D1Database): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db
      .prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
      .bind(key, value)
      .run();
  }

  const existing = await db
    .prepare("SELECT COUNT(*) AS count FROM departments")
    .first<{ count: number }>();
  if (Number(existing?.count ?? 0) > 0) return;

  const now = nowISO();
  const deptIds: Record<string, number> = {};
  const insertDepartment = db.prepare(
    "INSERT OR IGNORE INTO departments (dept_name, created_at) VALUES (?, ?)"
  );
  for (const name of ["AIML", "Computer Science", "Electronics", "Mechanical"]) {
    await insertDepartment.bind(name, now).run();
    const row = await db
      .prepare("SELECT dept_id FROM departments WHERE dept_name = ?")
      .bind(name)
      .first<{ dept_id: number }>();
    if (row) deptIds[name] = Number(row.dept_id);
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
  const insertBook = db.prepare(
    `INSERT INTO books (title, author, dept_id, availability_status, replacement_cost, created_at)
     SELECT ?, ?, ?, 'Available', 500, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM books WHERE title = ? COLLATE NOCASE AND dept_id = ?
     )`
  );
  for (const [title, author, dept] of books) {
    await insertBook.bind(title, author, deptIds[dept], now, title, deptIds[dept]).run();
  }

  await db
    .prepare(
      `INSERT INTO announcements (message, author, created_at)
       SELECT ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE author = 'Library')`
    )
    .bind(
      "Welcome to the department library portal. Borrow up to 3 books for 14 days. Fines are ₹5 per day after a 2-day grace period.",
      "Library",
      now
    )
    .run();
}
