"use client";

import { useEffect } from "react";
import { AlertTriangle, BookMarked, RefreshCw, Wallet } from "lucide-react";
import { useFetch } from "@/lib/client";
import { fmtDate, money } from "@/lib/format";
import { ErrorNote, LoadingRows, Pill } from "@/components/ui";
import type { LoanDTO } from "@/lib/types";

export function CirculationTab({ refreshKey }: { refreshKey: number }) {
  const circulation = useFetch<{ loans: LoanDTO[] }>("/api/admin/circulation");

  useEffect(() => {
    void circulation.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const loans = circulation.data?.loans ?? [];
  const overdue = loans.filter((loan) => loan.daysOverdue > 0);
  const finesToday = loans.reduce((total, loan) => total + loan.fineIfReturnedToday, 0);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid cols-3">
        <div className="stat">
          <div className="stat-icon cyan">
            <BookMarked size={19} />
          </div>
          <div>
            <div className="stat-label">Books on loan</div>
            <div className="stat-value">{loans.length}</div>
            <div className="stat-hint">Across all departments</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon red">
            <AlertTriangle size={19} />
          </div>
          <div>
            <div className="stat-label">Overdue</div>
            <div className="stat-value">{overdue.length}</div>
            <div className="stat-hint">Past their due date</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon green">
            <Wallet size={19} />
          </div>
          <div>
            <div className="stat-label">Fines if returned today</div>
            <div className="stat-value">{money(finesToday)}</div>
            <div className="stat-hint">Based on the current policy</div>
          </div>
        </div>
      </div>

      <section className="card card-flush">
        <div className="card-pad" style={{ paddingBottom: 14 }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <div>
              <div className="section-title">
                <BookMarked size={17} /> Live circulation
              </div>
              <div className="section-desc">Every book currently issued to a student.</div>
            </div>
            <button
              type="button"
              className="btn secondary sm"
              onClick={() => circulation.reload()}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {circulation.loading && <LoadingRows rows={4} />}
        {circulation.error && (
          <div style={{ padding: 18 }}>
            <ErrorNote message={circulation.error} />
          </div>
        )}
        {!circulation.loading && !circulation.error && loans.length === 0 && (
          <p className="muted tiny" style={{ padding: "18px 20px" }}>
            No books are currently issued.
          </p>
        )}
        {loans.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Book</th>
                  <th>Department</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Fine today</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.transactionId}>
                    <td>{loan.studentName}</td>
                    <td>
                      <div className="title-cell">{loan.title}</div>
                      <div className="cell-sub">{loan.author}</div>
                    </td>
                    <td>{loan.departmentName}</td>
                    <td className="nowrap">{fmtDate(loan.issueDate)}</td>
                    <td className="nowrap">{fmtDate(loan.dueDate)}</td>
                    <td>
                      <Pill status={loan.daysOverdue > 0 ? "Overdue" : loan.status} />
                    </td>
                    <td className="nowrap">
                      {loan.fineIfReturnedToday > 0 ? money(loan.fineIfReturnedToday) : "—"}
                    </td>
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
