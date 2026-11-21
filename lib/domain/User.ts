import { all, one, run } from "../db";
import { nowISO } from "../dates";
import { AppError } from "../errors";
import { verifyPassword } from "../password";
import type { HistoryEntry, PublicUser, Role, UserStatus } from "../types";

export interface UserRow {
  id: number;
  username: string;
  password: string;
  role: Role;
  status: UserStatus;
  created_at: string;
}

/** Base entity shared by administrators and students. */
export class User {
  id: number;
  username: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  protected passwordHash: string;

  constructor(row: UserRow) {
    this.id = row.id;
    this.username = row.username;
    this.role = row.role;
    this.status = row.status;
    this.createdAt = row.created_at;
    this.passwordHash = row.password;
  }

  static fromRow(row: UserRow | undefined): User | null {
    return row ? new User(row) : null;
  }

  static async findById(id: number): Promise<User | null> {
    return User.fromRow(await one<UserRow>("SELECT * FROM users WHERE id = ?", id));
  }

  static async findByUsername(username: string): Promise<User | null> {
    return User.fromRow(
      await one<UserRow>("SELECT * FROM users WHERE username = ?", username.trim())
    );
  }

  verifyPassword(password: string): boolean {
    return verifyPassword(password, this.passwordHash);
  }

  /** Validates credentials and account state, then records the session activity. */
  async login(password: string): Promise<this> {
    if (!this.verifyPassword(password)) {
      throw new AppError("Incorrect username or password.", 401);
    }
    if (this.status === "Suspended") {
      throw new AppError("This account is suspended. Please contact the librarian.", 403);
    }
    await this.log("LOGIN", `${this.role} signed in`);
    return this;
  }

  async logout(): Promise<void> {
    await this.log("LOGOUT", `${this.role} signed out`);
  }

  async log(action: string, detail = ""): Promise<void> {
    await run(
      "INSERT INTO activity_log (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)",
      this.id,
      action,
      detail,
      nowISO()
    );
  }

  /** Shared activity history — subclasses add their transaction records. */
  async checkHistory(): Promise<HistoryEntry[]> {
    return (
      await all<{ action: string; detail: string; created_at: string }>(
        "SELECT action, detail, created_at FROM activity_log WHERE user_id = ? ORDER BY log_id DESC LIMIT 100",
        this.id
      )
    ).map((row) => ({
      kind: "Activity" as const,
      title: row.action,
      detail: row.detail,
      date: row.created_at,
    }));
  }

  toPublic(): PublicUser {
    return {
      id: this.id,
      username: this.username,
      role: this.role,
      status: this.status,
      createdAt: this.createdAt,
    };
  }
}
