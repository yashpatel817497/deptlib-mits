"use client";

import {
  AlertTriangle,
  BookOpen,
  BookMarked,
  Building2,
  Download,
  IndianRupee,
  RotateCw,
  Users,
  Wallet,
} from "lucide-react";
import { fmtDate, money } from "@/lib/format";
import { ErrorNote, LoadingRows, Pill, Spinner } from "@/components/ui";
import type { ReportDTO } from "@/lib/types";

function Stat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "green" | "amber" | "red" | "cyan";
}) {
  return (
    <div className="stat">
      <div className={`stat-icon ${tone ?? ""}`}>{icon}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function OverviewTab({
  report,
  loading,
  onRefresh,
}: {
  report: ReportDTO | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (!report) {
    return (
      <section className="card card-pad">
        {loading ? <LoadingRows rows={6} /> : <ErrorNote message="Report unavailable." />}
      </section>
    );
  }

  const { totals } = report;
  const maxDeptBooks = Math.max(1, ...report.departments.map((dept) => dept.books));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid cols-4">
        <Stat
          label="Total books"
          value={String(totals.books)}
          hint={`${totals.availableBooks} available`}
          icon={<BookOpen size={19} />}
        />
        <Stat
          label="Issued"
          value={String(totals.issuedBooks)}
          hint={`${totals.activeLoans} active loans`}
          icon={<BookMarked size={19} />}
          tone="cyan"
        />
        <Stat
          label="Overdue"
          value={String(totals.overdueLoans)}
          hint="Loans past the due date"
          icon={<AlertTriangle size={19} />}
          tone="red"
        />
        <Stat
          label="Fines collected"
          value={money(totals.finesCollected)}
          hint={`${money(totals.outstandingFines)} outstanding`}
          icon={<IndianRupee size={19} />}
          tone="green"
        />
      </div>

      <div className="grid cols-4">
        <Stat label="Departments" value={String(totals.departments)} icon={<Building2 size={19} />} />
        <Stat
          label="Students"
          value={String(totals.students)}
          hint={`${totals.activeStudents} active`}
          icon={<Users size={19} />}
        />
        <Stat label="Lost copies" value={String(totals.lostBooks)} icon={<AlertTriangle size={19} />} tone="amber" />
        <Stat
          label="Outstanding fines"
          value={money(totals.outstandingFines)}
          hint="Across all students"
          icon={<Wallet size={19} />}
          tone="amber"
        />
      </div>

      <div className="two-col">
        <section className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">
                <Building2 size={17} /> Department breakdown
              </div>
              <div className="section-desc">Collection size and live circulation per department.</div>
            </div>
            <button type="button" className="btn secondary sm" onClick={onRefresh} disabled={loading}>
              {loading ? <Spinner /> : <RotateCw size={14} />} Refresh
            </button>
          </div>
          <div className="stack" style={{ gap: 16 }}>
            {report.departments.map((dept) => (
              <div key={dept.deptId}>
                <div className="inline" style={{ justifyContent: "space-between", width: "100%" }}>
                  <strong style={{ fontSize: 13.5 }}>{dept.deptName}</strong>
                  <span className="tiny muted">
                    {dept.books} books · {dept.issued} issued
                  </span>
                </div>
                <div className="bar" style={{ marginTop: 7 }}>
                  <div
                    className="bar-fill"
                    style={{ width: `${Math.max(4, (dept.books / maxDeptBooks) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">
                <BookOpen size={17} /> Most borrowed
              </div>
              <div className="section-desc">Top titles across the library.</div>
            </div>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {report.topBooks.map((book, index) => (
              <div
                key={book.bookId}
                className="inline"
                style={{ justifyContent: "space-between", width: "100%" }}
              >
                <div className="inline" style={{ gap: 12 }}>
                  <span
                    className="avatar"
                    style={{ width: 28, height: 28, fontSize: 11, borderRadius: 9 }}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 650 }}>{book.title}</div>
                    <div className="tiny muted">{book.author}</div>
                  </div>
                </div>
                <span className="pill neutral">{book.issueCount}×</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card card-flush">
        <div className="card-pad" style={{ paddingBottom: 12 }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <div>
              <div className="section-title">
                <BookMarked size={17} /> Recent transactions
              </div>
              <div className="section-desc">Latest issues, returns and lost reports.</div>
            </div>
            <a className="btn secondary sm" href="/api/admin/report?format=csv" download>
              <Download size={14} /> Export report CSV
            </a>
          </div>
        </div>
        {report.recentTransactions.length === 0 ? (
          <p className="muted tiny" style={{ padding: "18px 20px" }}>
            No transactions yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Book</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Fine</th>
                </tr>
              </thead>
              <tbody>
                {report.recentTransactions.map((loan) => (
                  <tr key={loan.transactionId}>
                    <td>{loan.studentName}</td>
                    <td>
                      <div className="title-cell">{loan.title}</div>
                      <div className="cell-sub">{loan.departmentName}</div>
                    </td>
                    <td className="nowrap">{fmtDate(loan.issueDate)}</td>
                    <td className="nowrap">{fmtDate(loan.dueDate)}</td>
                    <td>
                      <Pill status={loan.daysOverdue > 0 && loan.status === "Issued" ? "Overdue" : loan.status} />
                    </td>
                    <td className="nowrap">{loan.fineCalculated > 0 ? money(loan.fineCalculated) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card card-flush">
        <div className="card-pad" style={{ paddingBottom: 12 }}>
          <div className="section-title">
            <AlertTriangle size={17} /> Overdue loans
          </div>
          <div className="section-desc">Students who need a reminder.</div>
        </div>
        {report.overdue.length === 0 ? (
          <p className="muted tiny" style={{ padding: "18px 20px" }}>
            Nothing overdue — the shelves are in good shape.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Book</th>
                  <th>Due</th>
                  <th>Days late</th>
                  <th>Fine today</th>
                </tr>
              </thead>
              <tbody>
                {report.overdue.map((loan) => (
                  <tr key={loan.transactionId}>
                    <td>{loan.studentName}</td>
                    <td>
                      <div className="title-cell">{loan.title}</div>
                      <div className="cell-sub">{loan.departmentName}</div>
                    </td>
                    <td className="nowrap">{fmtDate(loan.dueDate)}</td>
                    <td>
                      <Pill status="Overdue" label={`${loan.daysOverdue} days`} />
                    </td>
                    <td className="nowrap">{money(loan.fineIfReturnedToday)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
