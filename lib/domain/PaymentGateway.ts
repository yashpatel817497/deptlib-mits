import { randomBytes } from "node:crypto";
import { all, one, run } from "../db";
import { nowISO } from "../dates";
import { AppError } from "../errors";
import type { PaymentDTO, PaymentStatus } from "../types";

interface PaymentRow {
  payment_reference_id: string;
  student_id: number;
  amount: number;
  payment_status: PaymentStatus;
  method: string;
  timestamp: string;
  student_name?: string;
}

/** Simulated payment gateway used to settle library fines. */
export class PaymentGateway {
  paymentReferenceId: string;
  studentId: number;
  amount: number;
  paymentStatus: PaymentStatus;
  method: string;
  timestamp: string;

  constructor(row: PaymentRow) {
    this.paymentReferenceId = row.payment_reference_id;
    this.studentId = row.student_id;
    this.amount = Number(row.amount);
    this.paymentStatus = row.payment_status;
    this.method = row.method;
    this.timestamp = row.timestamp;
  }

  static generateReference(): string {
    return `PAY-${Date.now().toString(36).toUpperCase()}-${randomBytes(3)
      .toString("hex")
      .toUpperCase()}`;
  }

  /**
   * Simulates a checkout: records a completed payment, clears the student's
   * outstanding balance and returns the gateway record.
   */
  static async processPayment(input: {
    studentId: number;
    amount: number;
    method: "UPI" | "Card";
    actorUserId?: number;
  }): Promise<PaymentGateway> {
    const student = await one<{ fine_balance: number; username: string }>(
      "SELECT fine_balance, username FROM students WHERE student_id = ?",
      input.studentId
    );
    if (!student) throw new AppError("Student not found.", 404);

    const balance = Number(student.fine_balance);
    if (balance <= 0) throw new AppError("There is no outstanding fine to pay.");
    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError("Enter a valid payment amount.");
    }
    if (amount > balance + 0.01) {
      throw new AppError("Payment cannot exceed the outstanding fine balance.");
    }

    const reference = PaymentGateway.generateReference();
    const timestamp = nowISO();
    await run(
      `INSERT INTO payments (payment_reference_id, student_id, amount, payment_status, method, timestamp)
       VALUES (?, ?, ?, 'Completed', ?, ?)`,
      reference,
      input.studentId,
      amount,
      input.method,
      timestamp
    );
    const remaining = Math.max(0, Math.round((balance - amount) * 100) / 100);
    await run(
      "UPDATE students SET fine_balance = ? WHERE student_id = ?",
      remaining,
      input.studentId
    );
    if (input.actorUserId) {
      await run(
        "INSERT INTO activity_log (user_id, action, detail, created_at) VALUES (?, 'FINE_PAYMENT', ?, ?)",
        input.actorUserId,
        `Paid ₹${amount.toFixed(2)} via ${input.method} (${reference})`,
        timestamp
      );
    }

    return new PaymentGateway({
      payment_reference_id: reference,
      student_id: input.studentId,
      amount,
      payment_status: "Completed",
      method: input.method,
      timestamp,
    });
  }

  static async generateReceipt(
    reference: string
  ): Promise<(PaymentDTO & { balanceAfter: number }) | null> {
    const row = await one<PaymentRow>(
      `SELECT p.*, s.username AS student_name
       FROM payments p JOIN students s ON s.student_id = p.student_id
       WHERE p.payment_reference_id = ?`,
      reference
    );
    if (!row) return null;
    const balance = await one<{ fine_balance: number }>(
      "SELECT fine_balance FROM students WHERE student_id = ?",
      row.student_id
    );
    return {
      paymentReferenceId: row.payment_reference_id,
      studentId: row.student_id,
      studentName: row.student_name,
      amount: Number(row.amount),
      paymentStatus: row.payment_status,
      method: row.method,
      timestamp: row.timestamp,
      balanceAfter: Number(balance?.fine_balance ?? 0),
    };
  }

  static async history(studentId: number): Promise<PaymentDTO[]> {
    return (
      await all<PaymentRow>(
        "SELECT * FROM payments WHERE student_id = ? ORDER BY timestamp DESC",
        studentId
      )
    ).map((row) => ({
      paymentReferenceId: row.payment_reference_id,
      studentId: row.student_id,
      amount: Number(row.amount),
      paymentStatus: row.payment_status,
      method: row.method,
      timestamp: row.timestamp,
    }));
  }

  static async all(): Promise<PaymentDTO[]> {
    return (
      await all<PaymentRow>(
        `SELECT p.*, s.username AS student_name
         FROM payments p JOIN students s ON s.student_id = p.student_id
         ORDER BY p.timestamp DESC`
      )
    ).map((row) => ({
      paymentReferenceId: row.payment_reference_id,
      studentId: row.student_id,
      studentName: row.student_name,
      amount: Number(row.amount),
      paymentStatus: row.payment_status,
      method: row.method,
      timestamp: row.timestamp,
    }));
  }
}
